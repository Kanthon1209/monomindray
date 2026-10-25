package logic

import "testing"

func TestRegionLabelFromProvince(t *testing.T) {
	cases := map[string]string{
		"安徽省":   "华东",
		"安徽":    "华东",
		"江苏省":   "华东",
		"北京市":   "华北",
		"北京":    "华北",
		"广东省":   "华南",
		"广西":    "华南",
		"广西壮族自治区": "华南",
		"河南省":   "华中",
		"四川省":   "西南",
		"新疆":    "西北",
		"黑龙江省":  "东北",
		"":      "",
		"火星省":   "",
	}
	for in, want := range cases {
		if got := regionLabelFromProvince(in); got != want {
			t.Fatalf("regionLabelFromProvince(%q)=%q want %q", in, got, want)
		}
	}
}

func TestResolveRegionFromProvinceAuthoritative(t *testing.T) {
	got := resolveRegionFromProvince("安徽省", "华北")
	if got != "华东" {
		t.Fatalf("expected authoritative 华东, got %q", got)
	}
	got = resolveRegionFromProvince("", "华北")
	if got != "华北" {
		t.Fatalf("fallback to client when province unknown, got %q", got)
	}
}
