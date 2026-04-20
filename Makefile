.PHONY: dev dev-build prod prod-build down logs \
        fly-setup fly-deploy-server fly-deploy-client fly-secrets \
        prisma-migrate prisma-studio

# ─── Local development ────────────────────────────────────────────────────────

dev: ## Start dev environment (hot-reload)
	docker compose up

dev-build: ## Rebuild images then start dev environment
	docker compose up --build

down: ## Stop and remove containers
	docker compose down

logs: ## Tail all logs
	docker compose logs -f

logs-server: ## Tail server logs only
	docker compose logs -f server

logs-client: ## Tail client logs only
	docker compose logs -f client

# ─── Production parity test ───────────────────────────────────────────────────

prod: ## Run production-mode containers locally
	docker compose -f docker-compose.prod.yml up

prod-build: ## Rebuild production images then run
	docker compose -f docker-compose.prod.yml up --build

# ─── Database ────────────────────────────────────────────────────────────────

prisma-migrate: ## Run pending migrations (direct URL)
	cd server && DATABASE_URL=$$(grep DIRECT_URL .env | cut -d= -f2-) npx prisma migrate deploy

prisma-studio: ## Open Prisma Studio
	cd server && npx prisma studio

# ─── fly.io ──────────────────────────────────────────────────────────────────

fly-setup: ## Create both fly.io apps (run once)
	cd server && fly apps create voronsk-server --org personal
	cd client && fly apps create voronsk-client --org personal

fly-secrets: ## Push all secrets to the server app from server/.env
	@cd server && grep -v '^#' .env | grep -v '^$$' | \
	  while IFS='=' read -r key value; do \
	    echo "Setting $$key"; \
	    fly secrets set "$$key=$$value" --app voronsk-server; \
	  done

fly-deploy-server: ## Deploy server to fly.io
	cd server && fly deploy

fly-deploy-client: ## Deploy client to fly.io
	cd client && fly deploy

fly-deploy: fly-deploy-server fly-deploy-client ## Deploy both services

# ─── Help ────────────────────────────────────────────────────────────────────

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
