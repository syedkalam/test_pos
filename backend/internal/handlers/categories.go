package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/mydate/surat-backend/internal/hub"
	"github.com/mydate/surat-backend/internal/models"
)

type CategoryHandler struct {
	db  *sql.DB
	hub *hub.Hub
}

func NewCategoryHandler(db *sql.DB, h *hub.Hub) *CategoryHandler {
	return &CategoryHandler{db: db, hub: h}
}

func (h *CategoryHandler) List(c *gin.Context) {
	rows, err := h.db.Query("SELECT id, name, parent_id, version, updated_at FROM categories")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query categories"})
		return
	}
	defer rows.Close()

	categoryMap := make(map[int64]*models.Category)
	var allIDs []int64

	for rows.Next() {
		var cat models.Category
		var parentID sql.NullInt64
		var updatedAt string
		if err := rows.Scan(&cat.ID, &cat.Name, &parentID, &cat.Version, &updatedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to scan category"})
			return
		}
		if parentID.Valid {
			cat.ParentID = &parentID.Int64
		}
		cat.UpdatedAt, _ = time.Parse("2006-01-02 15:04:05", updatedAt)
		cat.Children = []models.Category{}
		categoryMap[cat.ID] = &cat
		allIDs = append(allIDs, cat.ID)
	}

	var roots []models.Category
	for _, id := range allIDs {
		cat := categoryMap[id]
		if cat.ParentID == nil {
			roots = append(roots, *cat)
		} else {
			parent, ok := categoryMap[*cat.ParentID]
			if ok {
				parent.Children = append(parent.Children, *cat)
			}
		}
	}

	for i := range roots {
		resolveChildren(&roots[i], categoryMap)
	}

	if roots == nil {
		roots = []models.Category{}
	}

	c.JSON(http.StatusOK, roots)
}

func resolveChildren(cat *models.Category, categoryMap map[int64]*models.Category) {
	updated := categoryMap[cat.ID]
	if updated != nil {
		cat.Children = updated.Children
	}
	for i := range cat.Children {
		resolveChildren(&cat.Children[i], categoryMap)
	}
}

func (h *CategoryHandler) Bump(c *gin.Context) {
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
	err = h.db.QueryRow("SELECT version FROM categories WHERE id = ?", id).Scan(&current)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "category not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query category"})
		return
	}

	if current != req.ExpectedVersion {
		c.JSON(http.StatusConflict, gin.H{
			"error":           "version_conflict",
			"current_version": current,
		})
		return
	}

	_, err = h.db.Exec("UPDATE categories SET version = version+1, updated_at = datetime('now') WHERE id = ?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to bump version"})
		return
	}

	newVersion := current + 1
	event := models.SyncEvent{
		Type:      "category_bump",
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
