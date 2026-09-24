package handler

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/zeromicro/go-zero/rest/pathvar"
)

func parsePathID(r *http.Request) (int64, error) {
	raw := pathvar.Vars(r)["id"]
	if raw == "" {
		return 0, fmt.Errorf("missing path id")
	}
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || id <= 0 {
		return 0, fmt.Errorf("invalid path id")
	}
	return id, nil
}
