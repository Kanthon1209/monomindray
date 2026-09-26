package handler

import (
	"net/http"

	"mindray/internal/logic"
	"mindray/internal/svc"
	"mindray/internal/types"

	"github.com/zeromicro/go-zero/rest/httpx"
)

func ListAssayProjectOptionsHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		resp, err := logic.NewAssayProjectLogic(r.Context(), svcCtx).Options()
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}

func ListAssayProjectsHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.ListAssayProjectsRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		resp, err := logic.NewAssayProjectLogic(r.Context(), svcCtx).List(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}

func GetAssayProjectHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := parsePathID(r)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		resp, err := logic.NewAssayProjectLogic(r.Context(), svcCtx).Get(id)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}

func CreateAssayProjectHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.AssayProjectUpsertRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		resp, err := logic.NewAssayProjectLogic(r.Context(), svcCtx).Create(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}

func UpdateAssayProjectHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := parsePathID(r)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		var req types.AssayProjectUpsertRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		resp, err := logic.NewAssayProjectLogic(r.Context(), svcCtx).Update(id, &req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}

func DeleteAssayProjectHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := parsePathID(r)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		if err := logic.NewAssayProjectLogic(r.Context(), svcCtx).Delete(id); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			w.WriteHeader(http.StatusNoContent)
		}
	}
}
