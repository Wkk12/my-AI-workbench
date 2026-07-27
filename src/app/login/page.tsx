import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signToken, validatePassword } from "@/lib/auth";

const COOKIE_NAME = "wb_token";
const MAX_AGE = 7 * 24 * 60 * 60;

export default function LoginPage() {
  async function handleLogin(formData: FormData) {
    "use server";

    const password = formData.get("password") as string;
    if (!password || !validatePassword(password)) {
      return redirect("/login?error=1");
    }

    const token = await signToken("admin");
    const jar = await cookies();
    jar.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE,
    });

    return redirect("/");
  }

  // Show error if redirected back
  const showError = false; // Will be passed via searchParams

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
        <form action={handleLogin}>
          <input
            type="password"
            name="password"
            placeholder="密码"
            autoFocus
            required
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
          {showError && (
            <p style={{ color: "#e74c3c", fontSize: 12, marginTop: 6 }}>
              密码错误
            </p>
          )}
          <button
            type="submit"
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
              cursor: "pointer",
            }}
          >
            登录
          </button>
        </form>
        <p style={{ fontSize: 11, color: "#999", marginTop: 14 }}>
          推荐使用 Safari 或 Chrome 浏览器
        </p>
      </div>
    </div>
  );
}
