package types

type (
	LoginRequest struct {
		Email    string `json:"email" validate:"required,email"`
		Password string `json:"password" validate:"required,min=6"`
	}

	LoginResponse struct {
		Token string   `json:"token"`
		User  UserInfo `json:"user"`
	}

	SignupRequest struct {
		Name     string `json:"name" validate:"required,min=2"`
		Email    string `json:"email" validate:"required,email"`
		Password string `json:"password" validate:"required,min=8"`
	}

	SignupResponse struct {
		Token string   `json:"token"`
		User  UserInfo `json:"user"`
	}

	UserInfo struct {
		Id     int64  `json:"id"`
		Name   string `json:"name"`
		Email  string `json:"email"`
		Role   string `json:"role"`
		Avatar string `json:"avatar,omitempty"`
	}

	GetUserResponse struct {
		User UserInfo `json:"user"`
	}
)
