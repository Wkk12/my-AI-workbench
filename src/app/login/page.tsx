"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success) {
        window.location.href = data.redirect || "/";
      } else {
        setError(data.error || "密码错误");
        setPassword("");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #f5f5f5, #e8e8e8)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{
        background: "white",
        borderRadius: 16,
        padding: "32px 28px",
        width: 320,
        maxWidth: "90vw",
        boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        textAlign: "center",
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%",
          background: "#f0f0ff", display: "flex",
          alignItems: "center", justifyContent: "center",
          margin: "0 auto 12px", fontSize: 24,
        }}>🛡️</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: "#1a1a1a" }}>
          喵站工作台
        </h1>
        <p style={{ fontSize: 12, color: "#999", marginBottom: 20 }}>
          请输入管理员密码
        </p>
        <form action="/api/auth/login-form" method="POST" onSubmit={handleSubmit}>
          <input
            type="password"
            name="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            disabled={loading}
            style={{
              width: "100%",
              padding: "10px 14px",
              border: "1.5px solid #e0e0e0",
              borderRadius: 10,
              fontSize: 15,
              textAlign: "center",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          {error && (
            <p style={{ color: "#e74c3c", fontSize: 12, marginTop: 6 }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              marginTop: 16,
              padding: "10px 14px",
              background: "#6c5ce7",
              color: "white",
              border: "none",
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "验证中..." : "登录"}
          </button>
        </form>
        <p style={{ fontSize: 11, color: "#999", marginTop: 14 }}>
          推荐使用 Safari 或 Chrome 浏览器
        </p>
      </div>
    </div>
  );
}
