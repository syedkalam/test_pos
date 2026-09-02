package handlers

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/mydate/surat-backend/internal/models"
)

type CartHandler struct {
	db *sql.DB
}

func NewCartHandler(db *sql.DB) *CartHandler {
	return &CartHandler{db: db}
}

func findOrCreateCart(db *sql.DB, deviceID string) (int64, error) {
	_, err := db.Exec("INSERT OR IGNORE INTO carts (device_id) VALUES (?)", deviceID)
	if err != nil {
		return 0, err
	}
	var cartID int64
	err = db.QueryRow("SELECT id FROM carts WHERE device_id = ?", deviceID).Scan(&cartID)
	return cartID, err
}

func (h *CartHandler) Action(c *gin.Context) {
	var req models.CartActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	if req.DeviceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_id is required"})
		return
	}

	cartID, err := findOrCreateCart(h.db, req.DeviceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to find or create cart"})
		return
	}

	switch req.Action {
	case "list":
		cart, err := h.loadCart(cartID, req.DeviceID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load cart"})
			return
		}
		c.JSON(http.StatusOK, cart)

	case "add":
		var scheduledDelivery *string
		if req.ScheduledDelivery != nil {
			formatted := req.ScheduledDelivery.Format("2006-01-02 15:04:05")
			scheduledDelivery = &formatted
		}
		_, err := h.db.Exec(
			`INSERT INTO cart_items (cart_id, product_id, quantity, note, scheduled_delivery)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(cart_id, product_id) DO UPDATE SET quantity = quantity + excluded.quantity`,
			cartID, req.ProductID, req.Quantity, req.Note, scheduledDelivery,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add item to cart"})
			return
		}
		cart, err := h.loadCart(cartID, req.DeviceID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load cart"})
			return
		}
		c.JSON(http.StatusOK, cart)

	case "remove":
		_, err := h.db.Exec(
			"DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?",
			cartID, req.ProductID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to remove item from cart"})
			return
		}
		cart, err := h.loadCart(cartID, req.DeviceID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load cart"})
			return
		}
		c.JSON(http.StatusOK, cart)

	case "update":
		var scheduledDelivery *string
		if req.ScheduledDelivery != nil {
			formatted := req.ScheduledDelivery.Format("2006-01-02 15:04:05")
			scheduledDelivery = &formatted
		}
		_, err := h.db.Exec(
			"UPDATE cart_items SET quantity = ?, note = ?, scheduled_delivery = ? WHERE cart_id = ? AND product_id = ?",
			req.Quantity, req.Note, scheduledDelivery, cartID, req.ProductID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update cart item"})
			return
		}
		cart, err := h.loadCart(cartID, req.DeviceID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load cart"})
			return
		}
		c.JSON(http.StatusOK, cart)

	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown action"})
	}
}

func (h *CartHandler) loadCart(cartID int64, deviceID string) (*models.Cart, error) {
	cart := &models.Cart{
		ID:       cartID,
		DeviceID: deviceID,
		Items:    []models.CartItem{},
	}

	err := h.db.QueryRow("SELECT created_at FROM carts WHERE id = ?", cartID).Scan(&cart.CreatedAt)
	if err != nil {
		return nil, err
	}

	rows, err := h.db.Query(
		"SELECT id, cart_id, product_id, quantity, note, scheduled_delivery FROM cart_items WHERE cart_id = ?",
		cartID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var item models.CartItem
		var note sql.NullString
		var scheduledDelivery sql.NullString

		if err := rows.Scan(&item.ID, &item.CartID, &item.ProductID, &item.Quantity, &note, &scheduledDelivery); err != nil {
			return nil, err
		}

		if note.Valid {
			item.Note = &note.String
		}
		if scheduledDelivery.Valid && scheduledDelivery.String != "" {
			parsed, err := time.Parse("2006-01-02 15:04:05", scheduledDelivery.String)
			if err == nil {
				item.ScheduledDelivery = &parsed
			}
		}

		product, err := h.loadProduct(item.ProductID)
		if err == nil {
			item.Product = product
		}

		cart.Items = append(cart.Items, item)
	}

	return cart, nil
}

func (h *CartHandler) loadProduct(productID int64) (*models.Product, error) {
	var p models.Product
	var updatedAt string
	err := h.db.QueryRow(
		"SELECT id, name, description, price, category_id, version, cursor, updated_at FROM products WHERE id = ?",
		productID,
	).Scan(&p.ID, &p.Name, &p.Description, &p.Price, &p.CategoryID, &p.Version, &p.Cursor, &updatedAt)
	if err != nil {
		return nil, err
	}
	p.UpdatedAt, _ = time.Parse("2006-01-02 15:04:05", updatedAt)
	return &p, nil
}
