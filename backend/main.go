package main

import (
	"flag"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mydate/surat-backend/internal/db"
	"github.com/mydate/surat-backend/internal/handlers"
	"github.com/mydate/surat-backend/internal/hub"
)

func main() {
	seed := flag.Bool("seed", false, "seed the database and exit")
	flag.Parse()

	if err := db.Open(); err != nil {
		log.Fatal(err)
	}

	if *seed {
		db.Seed(db.DB)
		log.Println("Seeding complete")
		return
	}

	h := hub.NewHub()
	go h.Run()

	r := gin.Default()
	r.Use(corsMiddleware())

	ph := handlers.NewProductHandler(db.DB, h)
	ch := handlers.NewCategoryHandler(db.DB, h)
	th := handlers.NewTagHandler(db.DB, h)
	cah := handlers.NewCartHandler(db.DB)
	oh := handlers.NewOrderHandler(db.DB, h)
	sh := handlers.NewSyncHandler(db.DB, h)

	r.GET("/products", ph.List)
	r.POST("/products/:id/bump", ph.Bump)
	r.GET("/categories", ch.List)
	r.POST("/categories/:id/bump", ch.Bump)
	r.GET("/tags", th.List)
	r.POST("/tags/:id/bump", th.Bump)
	r.POST("/cart", cah.Action)
	r.POST("/orders", oh.Create)
	r.GET("/orders", oh.List)
	r.POST("/orders/:id/pay", oh.Pay)
	r.GET("/sync", sh.Sync)
	r.GET("/ws", sh.WS)

	log.Println("Server running on :8080")
	if err := http.ListenAndServe(":8080", r); err != nil {
		log.Fatal(err)
	}
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}
