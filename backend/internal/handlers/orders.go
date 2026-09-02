package handlers

import (
	"database/sql"
	"encoding/json"
	"math/rand"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/mydate/surat-backend/internal/hub"
	"github.com/mydate/surat-backend/internal/models"
)

type OrderHandler struct {
	db  *sql.DB
	hub *hub.Hub
}

func NewOrderHandler(db *sql.DB, h *hub.Hub) *OrderHandler {
	return &OrderHandler{db: db, hub: h}
}

func (h *OrderHandler) Create(c *gin.Context) {
	var body struct {
		DeviceID string `json:"device_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.DeviceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_id is required"})
		return
	}

	var cartID int64
	err := h.db.QueryRow("SELECT id FROM carts WHERE device_id = ?", body.DeviceID).Scan(&cartID)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "cart not found for device"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to find cart"})
		return
	}

	var itemCount int
	h.db.QueryRow("SELECT COUNT(*) FROM cart_items WHERE cart_id = ?", cartID).Scan(&itemCount)
	if itemCount == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cart is empty"})
		return
	}

	res, err := h.db.Exec("INSERT INTO orders (cart_id, status) VALUES (?, 'draft')", cartID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create order"})
		return
	}

	orderID, _ := res.LastInsertId()

	order := models.Order{
		ID:        orderID,
		CartID:    cartID,
		Status:    "draft",
		CreatedAt: time.Now().UTC(),
	}

	c.JSON(http.StatusCreated, order)
}

func (h *OrderHandler) List(c *gin.Context) {
	deviceID := c.Query("device_id")

	var rows *sql.Rows
	var err error

	if deviceID != "" {
		rows, err = h.db.Query(
			`SELECT o.id, o.cart_id, o.status, o.created_at
			 FROM orders o
			 JOIN carts ca ON ca.id = o.cart_id
			 WHERE ca.device_id = ?
			 ORDER BY o.id DESC`,
			deviceID,
		)
	} else {
		rows, err = h.db.Query(
			"SELECT id, cart_id, status, created_at FROM orders ORDER BY id DESC",
		)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query orders"})
		return
	}
	defer rows.Close()

	var orders []models.Order
	for rows.Next() {
		var o models.Order
		var createdAt string
		if err := rows.Scan(&o.ID, &o.CartID, &o.Status, &createdAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to scan order"})
			return
		}
		o.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
		orders = append(orders, o)
	}

	if orders == nil {
		orders = []models.Order{}
	}

	c.JSON(http.StatusOK, orders)
}

func (h *OrderHandler) Pay(c *gin.Context) {
	idStr := c.Param("id")
	orderID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var status string
	err = h.db.QueryRow("SELECT status FROM orders WHERE id = ?", orderID).Scan(&status)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query order"})
		return
	}

	if status != "draft" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "order_not_in_draft"})
		return
	}

	var paymentStatus string
	if rand.Intn(10) < 3 {
		paymentStatus = "failed"
	} else {
		paymentStatus = "success"
	}

	_, err = h.db.Exec("INSERT INTO payments (order_id, status) VALUES (?, ?)", orderID, paymentStatus)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to record payment"})
		return
	}

	_, err = h.db.Exec("UPDATE orders SET status = ? WHERE id = ?", paymentStatus, orderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update order status"})
		return
	}

	eventData := map[string]interface{}{
		"type":       "order_update",
		"entity_id":  orderID,
		"version":    0,
		"updated_at": time.Now().UTC(),
		"status":     paymentStatus,
	}
	if data, err := json.Marshal(eventData); err == nil {
		h.hub.Broadcast(data)
	}

	c.JSON(http.StatusOK, gin.H{
		"order_id":       orderID,
		"payment_status": paymentStatus,
		"order_status":   paymentStatus,
	})
}
