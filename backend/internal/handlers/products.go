package handlers

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/mydate/surat-backend/internal/hub"
	"github.com/mydate/surat-backend/internal/models"
)

type ProductHandler struct {
	db  *sql.DB
	hub *hub.Hub
}

func NewProductHandler(db *sql.DB, h *hub.Hub) *ProductHandler {
	return &ProductHandler{db: db, hub: h}
}

func (h *ProductHandler) List(c *gin.Context) {
	limitStr := c.DefaultQuery("limit", "50")
	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	afterCursor := c.Query("after")
	var afterID int64

	if afterCursor != "" {
		decoded, err := base64.StdEncoding.DecodeString(afterCursor)
		if err == nil {
			parsed, err := strconv.ParseInt(string(decoded), 10, 64)
			if err == nil {
				afterID = parsed
			}
		}
	}

	rows, err := h.db.Query(
		"SELECT id, name, description, price, category_id, version, cursor, updated_at FROM products WHERE id > ? ORDER BY id ASC LIMIT ?",
		afterID, limit+1,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query products"})
		return
	}
	defer rows.Close()

	var products []models.Product
	for rows.Next() {
		var p models.Product
		var updatedAt string
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.Price, &p.CategoryID, &p.Version, &p.Cursor, &updatedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to scan product"})
			return
		}
		p.UpdatedAt, _ = time.Parse("2006-01-02 15:04:05", updatedAt)
		products = append(products, p)
	}

	var nextCursor *string
	if len(products) > limit {
		last := products[limit]
		nextCursor = &last.Cursor
		products = products[:limit]
	}

	for i := range products {
		tags, err := h.loadProductTags(products[i].ID)
		if err == nil {
			products[i].Tags = tags
		}
	}

	var totalCount int64
	h.db.QueryRow("SELECT COUNT(*) FROM products").Scan(&totalCount)

	if products == nil {
		products = []models.Product{}
	}

	c.JSON(http.StatusOK, models.ProductsResponse{
		Data:       products,
		NextCursor: nextCursor,
		TotalCount: totalCount,
	})
}

func (h *ProductHandler) loadProductTags(productID int64) ([]models.Tag, error) {
	rows, err := h.db.Query(
		"SELECT t.id, t.name, t.version, t.updated_at FROM tags t JOIN product_tags pt ON pt.tag_id = t.id WHERE pt.product_id = ?",
		productID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tags []models.Tag
	for rows.Next() {
		var t models.Tag
		var updatedAt string
		if err := rows.Scan(&t.ID, &t.Name, &t.Version, &updatedAt); err != nil {
			continue
		}
		t.UpdatedAt, _ = time.Parse("2006-01-02 15:04:05", updatedAt)
		tags = append(tags, t)
	}
	return tags, nil
}

func (h *ProductHandler) Bump(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req models.BumpRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	var current int64
	err = h.db.QueryRow("SELECT version FROM products WHERE id = ?", id).Scan(&current)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "product not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query product"})
		return
	}

	if current != req.ExpectedVersion {
		c.JSON(http.StatusConflict, gin.H{
			"error":           "version_conflict",
			"current_version": current,
		})
		return
	}

	_, err = h.db.Exec("UPDATE products SET version = version+1, updated_at = datetime('now') WHERE id = ?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to bump version"})
		return
	}

	newVersion := current + 1
	event := models.SyncEvent{
		Type:      "product_bump",
		EntityID:  id,
		Version:   newVersion,
		UpdatedAt: time.Now().UTC(),
	}
	if data, err := json.Marshal(event); err == nil {
		h.hub.Broadcast(data)
	}

	c.JSON(http.StatusOK, gin.H{
		"id":      id,
		"version": newVersion,
	})
}

