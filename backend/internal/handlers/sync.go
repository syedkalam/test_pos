package handlers

import (
	"database/sql"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/mydate/surat-backend/internal/hub"
	"github.com/mydate/surat-backend/internal/models"
)

type SyncHandler struct {
	db       *sql.DB
	hub      *hub.Hub
	upgrader websocket.Upgrader
}

func NewSyncHandler(db *sql.DB, h *hub.Hub) *SyncHandler {
	return &SyncHandler{
		db:  db,
		hub: h,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
	}
}

func (h *SyncHandler) Sync(c *gin.Context) {
	sinceStr := c.Query("since")
	if sinceStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "since parameter is required"})
		return
	}

	since, err := strconv.ParseInt(sinceStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid since parameter"})
		return
	}

	products, err := h.querySyncEvents("SELECT id, version, updated_at FROM products WHERE version > ?", "product_bump", since)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query product sync events"})
		return
	}

	categories, err := h.querySyncEvents("SELECT id, version, updated_at FROM categories WHERE version > ?", "category_bump", since)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query category sync events"})
		return
	}

	tags, err := h.querySyncEvents("SELECT id, version, updated_at FROM tags WHERE version > ?", "tag_bump", since)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query tag sync events"})
		return
	}

	c.JSON(http.StatusOK, models.SyncResponse{
		Products:   products,
		Categories: categories,
		Tags:       tags,
	})
}

func (h *SyncHandler) querySyncEvents(query string, eventType string, since int64) ([]models.SyncEvent, error) {
	rows, err := h.db.Query(query, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []models.SyncEvent
	for rows.Next() {
		var e models.SyncEvent
		var updatedAt string
		if err := rows.Scan(&e.EntityID, &e.Version, &updatedAt); err != nil {
			return nil, err
		}
		e.Type = eventType
		e.UpdatedAt, _ = time.Parse("2006-01-02 15:04:05", updatedAt)
		events = append(events, e)
	}

	if events == nil {
		events = []models.SyncEvent{}
	}

	return events, nil
}

func (h *SyncHandler) WS(c *gin.Context) {
	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	h.hub.ServeWS(conn)
}
