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
      }}>
        
        <h1 style={{
          fontSize: 22, fontWeight: 700, marginBottom: 4,
          color: "#1a1a1a", textAlign: "center",
        }}>
          喵站工作台
        </h1>
        <p style={{
          fontSize: 13, color: "#888", marginBottom: 24,
          textAlign: "center",
        }}>
          请输入管理员密码
        </p>
        <form action="/api/auth/login" method="POST" onSubmit={handleSubmit}>
          <input
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            autoFocus
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
            onFocus={(e) => e.target.style.borderColor = "#6c5ce7"}
            onBlur={(e) => e.target.style.borderColor = "#e0e0e0"}
          />
          {error ? (
            <p style={{
              color: "#e74c3c", fontSize: 12, marginTop: 8,
              textAlign: "center",
            }}>
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              marginTop: 14,
              padding: "10px 14px",
              background: loading ? "#b4a5f0" : "#6c5ce7",
              color: "white",
              border: "none",
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "验证中..." : "登录"}
          </button>
        </form>
        <p style={{ fontSize: 11, color: "#aaa", marginTop: 16, textAlign: "center" }}>
          JS 未加载时表单会直接提交
        </p>
      </div>
    </div>
  );
}
