package db

import (
	"database/sql"
	"encoding/base64"
	"fmt"
	"log"

	"github.com/brianvoe/gofakeit/v6"
)

func Seed(db *sql.DB) {
	var count int64
	if err := db.QueryRow("SELECT COUNT(*) FROM products").Scan(&count); err != nil {
		log.Printf("seed check failed: %v", err)
		return
	}
	if count > 0 {
		log.Printf("database already seeded with %d products, skipping", count)
		return
	}

	fake := gofakeit.New(42)

	topLevelNames := []string{"Electronics", "Clothing", "Food & Beverage", "Home & Garden", "Sports & Outdoors"}
	var leafCategoryIDs []int64

	log.Printf("seeding categories...")
	for _, topName := range topLevelNames {
		res, err := db.Exec("INSERT INTO categories (name, parent_id) VALUES (?, NULL)", topName)
		if err != nil {
			log.Printf("failed to insert top-level category %s: %v", topName, err)
			return
		}
		topID, _ := res.LastInsertId()

		for i := 0; i < 3; i++ {
			subName := fake.Word()
			res2, err := db.Exec("INSERT INTO categories (name, parent_id) VALUES (?, ?)", subName, topID)
			if err != nil {
				log.Printf("failed to insert subcategory: %v", err)
				return
			}
			subID, _ := res2.LastInsertId()

			for j := 0; j < 2; j++ {
				subSubName := fake.Word()
				res3, err := db.Exec("INSERT INTO categories (name, parent_id) VALUES (?, ?)", subSubName, subID)
				if err != nil {
					log.Printf("failed to insert sub-subcategory: %v", err)
					return
				}
				leafID, _ := res3.LastInsertId()
				leafCategoryIDs = append(leafCategoryIDs, leafID)
			}
		}
	}
	log.Printf("created %d leaf categories", len(leafCategoryIDs))

	log.Printf("seeding tags...")
	tagSet := make(map[string]bool)
	var tagIDs []int64
	for len(tagSet) < 50 {
		word := fake.Word()
		if tagSet[word] {
			continue
		}
		tagSet[word] = true
		res, err := db.Exec("INSERT INTO tags (name) VALUES (?)", word)
		if err != nil {
			continue
		}
		tagID, _ := res.LastInsertId()
		tagIDs = append(tagIDs, tagID)
	}
	log.Printf("created %d tags", len(tagIDs))

	log.Printf("seeding 5000 products in batches of 500...")
	totalProducts := 5000
	batchSize := 500

	for batchStart := 0; batchStart < totalProducts; batchStart += batchSize {
		batchEnd := batchStart + batchSize
		if batchEnd > totalProducts {
			batchEnd = totalProducts
		}

		tx, err := db.Begin()
		if err != nil {
			log.Printf("failed to begin transaction: %v", err)
			return
		}

		var batchIDs []int64
		for i := batchStart; i < batchEnd; i++ {
			catID := leafCategoryIDs[fake.Number(0, len(leafCategoryIDs)-1)]
			name := fake.ProductName()
			desc := fake.Sentence(10)
			price := fake.Price(1.0, 500.0)

			res, err := tx.Exec(
				"INSERT INTO products (name, description, price, category_id, cursor) VALUES (?, ?, ?, ?, ?)",
				name, desc, price, catID, "",
			)
			if err != nil {
				tx.Rollback()
				log.Printf("failed to insert product: %v", err)
				return
			}
			id, _ := res.LastInsertId()
			batchIDs = append(batchIDs, id)
		}

		for _, id := range batchIDs {
			cursor := base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("%010d", id)))
			if _, err := tx.Exec("UPDATE products SET cursor = ? WHERE id = ?", cursor, id); err != nil {
				tx.Rollback()
				log.Printf("failed to update cursor: %v", err)
				return
			}
		}

		for _, productID := range batchIDs {
			numTags := 1 + fake.Number(0, 4)
			usedTags := make(map[int64]bool)
			for t := 0; t < numTags; t++ {
				tagID := tagIDs[fake.Number(0, len(tagIDs)-1)]
				if usedTags[tagID] {
					continue
				}
				usedTags[tagID] = true
				tx.Exec("INSERT OR IGNORE INTO product_tags (product_id, tag_id) VALUES (?, ?)", productID, tagID)
			}
		}

		if err := tx.Commit(); err != nil {
			log.Printf("failed to commit batch: %v", err)
			return
		}

		log.Printf("seeded products %d-%d", batchStart+1, batchEnd)
	}

	log.Printf("seeding complete")
}
