#!/bin/bash

# Database migration runner using Docker
# For environments where psql is not installed locally

set -euo pipefail

# Configuration
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-rtmh_postgres}"
POSTGRES_USER="${POSTGRES_USER:-rtuser}"
POSTGRES_DB="${POSTGRES_DB:-rt_monitoring}"
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

# Check if docker container is running
check_container() {
    if ! docker ps | grep -q "$POSTGRES_CONTAINER"; then
        log_error "PostgreSQL container '$POSTGRES_CONTAINER' is not running."
        log_info "Start it with: docker-compose -f infra/docker-compose.yml up -d"
        exit 1
    fi
}

# Execute SQL via docker
exec_sql() {
    local sql="$1"
    docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$sql"
}

# Execute SQL file via docker
exec_sql_file() {
    local file_path="$1"
    docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$file_path"
}

# Test database connection
test_connection() {
    log_info "Testing database connection..."
    if exec_sql "SELECT 1;" > /dev/null 2>&1; then
        log_info "✓ Database connection successful"
    else
        log_error "✗ Failed to connect to database"
        exit 1
    fi
}

# Create migrations tracking table
create_migrations_table() {
    log_info "Creating migrations tracking table..."
    exec_sql "
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id SERIAL PRIMARY KEY,
            filename VARCHAR(255) NOT NULL UNIQUE,
            applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    " > /dev/null
}

# Get applied migrations
get_applied_migrations() {
    exec_sql "SELECT filename FROM schema_migrations ORDER BY filename;" 2>/dev/null | tail -n +3 | head -n -2 | sed 's/^ *//' | grep -v '^$' || true
}

# Apply a migration
apply_migration() {
    local migration_file="$1"
    local filename=$(basename "$migration_file")
    
    log_info "Applying migration: $filename"
    
    # Create temp SQL that includes the migration and tracking
    local temp_sql=$(mktemp)
    cat > "$temp_sql" << EOF
BEGIN;
$(cat "$migration_file")
INSERT INTO schema_migrations (filename) VALUES ('$filename');
COMMIT;
EOF
    
    if exec_sql_file "$temp_sql" > /dev/null 2>&1; then
        log_info "✓ Successfully applied $filename"
        rm "$temp_sql"
    else
        log_error "✗ Failed to apply $filename"
        rm "$temp_sql"
        exit 1
    fi
}

# Run all migrations
run_migrations() {
    log_info "Starting database migrations..."
    
    # Create migrations table
    create_migrations_table
    
    # Get applied migrations
    applied_migrations=$(get_applied_migrations)
    
    # Find migration files
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
    
    # Apply each migration
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

# Show migration status
show_status() {
    log_info "Migration Status"
    echo "Container: $POSTGRES_CONTAINER"
    echo "Database: $POSTGRES_DB"
    echo ""
    
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

# Show help
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Database migration runner using Docker for Real-Time DevOps Monitoring Hub"
    echo ""
    echo "OPTIONS:"
    echo "  -h, --help     Show this help message"
    echo "  --test         Test database connection only"
    echo "  --status       Show migration status"
    echo ""
    echo "ENVIRONMENT:"
    echo "  POSTGRES_CONTAINER   Container name (default: rtmh_postgres)"
    echo "  POSTGRES_USER        Database user (default: rtuser)"  
    echo "  POSTGRES_DB          Database name (default: rt_monitoring)"
    echo ""
    echo "EXAMPLES:"
    echo "  $0                    # Run all pending migrations"
    echo "  $0 --test            # Test connection only"
    echo "  $0 --status          # Show migration status"
}

# Parse arguments
case "${1:-}" in
    -h|--help)
        show_help
        exit 0
        ;;
    --test)
        check_container
        test_connection
        exit 0
        ;;
    --status)
        check_container
        show_status
        exit 0
        ;;
    "")
        check_container
        test_connection
        run_migrations
        ;;
    *)
        log_error "Unknown option: $1"
        show_help
        exit 1
        ;;
esac