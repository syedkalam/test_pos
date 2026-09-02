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

type TagHandler struct {
	db  *sql.DB
	hub *hub.Hub
}

func NewTagHandler(db *sql.DB, h *hub.Hub) *TagHandler {
	return &TagHandler{db: db, hub: h}
}

func (h *TagHandler) List(c *gin.Context) {
	rows, err := h.db.Query("SELECT id, name, version, updated_at FROM tags ORDER BY name ASC")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query tags"})
		return
	}
	defer rows.Close()

	var tags []models.Tag
	for rows.Next() {
		var t models.Tag
		var updatedAt string
		if err := rows.Scan(&t.ID, &t.Name, &t.Version, &updatedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to scan tag"})
			return
		}
		t.UpdatedAt, _ = time.Parse("2006-01-02 15:04:05", updatedAt)
		tags = append(tags, t)
	}

	if tags == nil {
		tags = []models.Tag{}
	}

	c.JSON(http.StatusOK, tags)
}

func (h *TagHandler) Bump(c *gin.Context) {
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
	err = h.db.QueryRow("SELECT version FROM tags WHERE id = ?", id).Scan(&current)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "tag not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query tag"})
		return
	}

	if current != req.ExpectedVersion {
		c.JSON(http.StatusConflict, gin.H{
			"error":           "version_conflict",
			"current_version": current,
		})
		return
	}

	_, err = h.db.Exec("UPDATE tags SET version = version+1, updated_at = datetime('now') WHERE id = ?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to bump version"})
		return
	}

	newVersion := current + 1
	event := models.SyncEvent{
		Type:      "tag_bump",
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
