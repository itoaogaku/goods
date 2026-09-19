import { ImageResponse } from "next/og";

// iPhoneで「ホーム画面に追加」した時に使われるアイコン。iOS側で角を自動的に
// 丸めるため、ここでは角丸をつけない一枚の正方形として描く。
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #4f9686 0%, #1f4a42 100%)",
        }}
      >
        <div style={{ position: "relative", width: 108, height: 100, display: "flex" }}>
          {/* 持ち手 */}
          <div
            style={{
              position: "absolute",
              top: -24,
              left: 24,
              width: 60,
              height: 30,
              borderTopLeftRadius: 30,
              borderTopRightRadius: 30,
              border: "11px solid white",
              borderBottom: "none",
            }}
          />
          {/* 袋本体 */}
          <div
            style={{
              position: "absolute",
              top: 10,
              width: 108,
              height: 90,
              background: "white",
              borderRadius: 18,
            }}
          />
        </div>
      </div>
    ),
    { ...size }
  );
}
