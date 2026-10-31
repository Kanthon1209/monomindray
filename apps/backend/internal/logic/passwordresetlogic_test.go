package logic

import "testing"

func TestMaskEmail(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"a@x.com", "a***@x.com"},
		{"ab@x.com", "a***@x.com"},
		{"abc@x.com", "a***c@x.com"},
		{"admin@mindray.com", "a***n@mindray.com"},
		{"bad", "***"},
	}
	for _, c := range cases {
		if got := maskEmail(c.in); got != c.want {
			t.Fatalf("maskEmail(%q)=%q want %q", c.in, got, c.want)
		}
	}
}

func TestGeneratePasswordResetToken(t *testing.T) {
	raw, hash, err := generatePasswordResetToken()
	if err != nil {
		t.Fatal(err)
	}
	if len(raw) != 64 {
		t.Fatalf("raw len=%d", len(raw))
	}
	if hash != hashPasswordResetToken(raw) {
		t.Fatal("hash mismatch")
	}
	raw2, hash2, err := generatePasswordResetToken()
	if err != nil {
		t.Fatal(err)
	}
	if raw == raw2 || hash == hash2 {
		t.Fatal("tokens should be unique")
	}
}
