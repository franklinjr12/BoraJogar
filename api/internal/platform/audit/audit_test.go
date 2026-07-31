package audit

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

type fakeDB struct {
	query string
	args  []any
}

func (f *fakeDB) Exec(_ context.Context, query string, args ...any) (pgconn.CommandTag, error) {
	f.query, f.args = query, args
	return pgconn.NewCommandTag("INSERT 0 1"), nil
}

func TestRecordUsesSafeEmptyDetails(t *testing.T) {
	db := &fakeDB{}
	actor, target := uuid.New(), uuid.New()
	if err := Record(context.Background(), db, actor, UserDisabled, "user", target, nil); err != nil {
		t.Fatal(err)
	}
	if db.query == "" || len(db.args) != 6 || string(db.args[5].([]byte)) != `{}` {
		t.Fatalf("query=%q args=%#v", db.query, db.args)
	}
}
