#!/bin/bash

# Database migration runner for Real-Time DevOps Monitoring Hub
# Applies SQL migration files in order

set -euo pipefail

# Configuration
POSTGRES_URL="${POSTGRES_URL:-postgres://rtuser:rtpass@localhost:5432/rt_monitoring}"
MIGRATIONS_DIR="$(dirname "$0")/migrations"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if psql is available
if ! command -v psql &> /dev/null; then
    log_error "psql command not found. Please install PostgreSQL client."
    exit 1
fi

# Create migrations tracking table if it doesn't exist
create_migrations_table() {
    log_info "Creating migrations tracking table..."
    psql "$POSTGRES_URL" -c "
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id SERIAL PRIMARY KEY,
            filename VARCHAR(255) NOT NULL UNIQUE,
            applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    " > /dev/null
}

# Get list of applied migrations
get_applied_migrations() {
    psql "$POSTGRES_URL" -t -c "SELECT filename FROM schema_migrations ORDER BY filename;" 2>/dev/null | sed 's/^ *//' | grep -v '^$' || true
}

# Apply a single migration
apply_migration() {
    local migration_file="$1"
    local filename=$(basename "$migration_file")
    
    log_info "Applying migration: $filename"
    
    # Run the migration in a transaction
    psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 << EOF
BEGIN;
\i $migration_file
INSERT INTO schema_migrations (filename) VALUES ('$filename');
COMMIT;
EOF
    
    if [ $? -eq 0 ]; then
        log_info "✓ Successfully applied $filename"
    else
        log_error "✗ Failed to apply $filename"
        exit 1
    fi
}

# Main migration logic
run_migrations() {
    log_info "Starting database migrations..."
    
    # Create migrations table
    create_migrations_table
    
    # Get applied migrations
    applied_migrations=$(get_applied_migrations)
    
    # Find all migration files
    if [ ! -d "$MIGRATIONS_DIR" ]; then
        log_error "Migrations directory not found: $MIGRATIONS_DIR"
        exit 1
    fi
    
    migration_files=$(find "$MIGRATIONS_DIR" -name "*.sql" | sort)
    
    if [ -z "$migration_files" ]; then
        log_warn "No migration files found in $MIGRATIONS_DIR"
        return 0
    fi
    
    migrations_applied=0
    
    # Apply each migration if not already applied
    for migration_file in $migration_files; do
        filename=$(basename "$migration_file")
        
        if echo "$applied_migrations" | grep -q "^$filename$"; then
            log_info "⏭ Skipping already applied migration: $filename"
        else
            apply_migration "$migration_file"
            migrations_applied=$((migrations_applied + 1))
        fi
    done
    
    if [ $migrations_applied -eq 0 ]; then
        log_info "All migrations are up to date."
    else
        log_info "Applied $migrations_applied new migration(s)."
    fi
}

# Test database connection
test_connection() {
    log_info "Testing database connection..."
    if psql "$POSTGRES_URL" -c "SELECT 1;" > /dev/null 2>&1; then
        log_info "✓ Database connection successful"
    else
        log_error "✗ Failed to connect to database: $POSTGRES_URL"
        exit 1
    fi
}

# Show help
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Database migration runner for Real-Time DevOps Monitoring Hub"
    echo ""
    echo "OPTIONS:"
    echo "  -h, --help     Show this help message"
    echo "  --test         Test database connection only"
    echo "  --status       Show migration status"
    echo ""
    echo "ENVIRONMENT:"
    echo "  POSTGRES_URL   Postgres connection string (default: postgres://rtuser:rtpass@localhost:5432/rt_monitoring)"
    echo ""
    echo "EXAMPLES:"
    echo "  $0                                    # Run all pending migrations"
    echo "  POSTGRES_URL=postgres://... $0       # Use custom database URL"
    echo "  $0 --test                            # Test connection only"
}

# Show migration status
show_status() {
    log_info "Migration Status"
    echo "Database: $POSTGRES_URL"
    echo ""
    
    # Test connection first
    if ! psql "$POSTGRES_URL" -c "SELECT 1;" > /dev/null 2>&1; then
        log_error "Cannot connect to database"
        return 1
    fi
    
    # Create migrations table if needed
    create_migrations_table > /dev/null 2>&1
    
    applied_migrations=$(get_applied_migrations)
    migration_files=$(find "$MIGRATIONS_DIR" -name "*.sql" 2>/dev/null | sort)
    
    echo "Applied Migrations:"
    if [ -z "$applied_migrations" ]; then
        echo "  (none)"
    else
        echo "$applied_migrations" | sed 's/^/  ✓ /'
    fi
    
    echo ""
    echo "Pending Migrations:"
    pending_found=false
    for migration_file in $migration_files; do
        filename=$(basename "$migration_file")
        if ! echo "$applied_migrations" | grep -q "^$filename$"; then
            echo "  • $filename"
            pending_found=true
        fi
    done
    
    if [ "$pending_found" = false ]; then
        echo "  (none)"
    fi
}

# Parse command line arguments
case "${1:-}" in
    -h|--help)
        show_help
        exit 0
        ;;
    --test)
        test_connection
        exit 0
        ;;
    --status)
        show_status
        exit 0
        ;;
    "")
        # Default action: run migrations
        test_connection
        run_migrations
        ;;
    *)
        log_error "Unknown option: $1"
        show_help
        exit 1
        ;;
esac