import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function SplashApp() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        backgroundColor: "#1e1e1e",
        margin: 0,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "50%",
          height: "50%",
          borderRadius: "10px",
          overflow: "hidden",
          boxShadow: "inset 0 0 60px 30px #1e1e1e",
        }}
      >
        <video
          autoPlay
          muted
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            zIndex: -1,
          }}
        >
          <source src="/splash.mp4" type="video/mp4" />
        </video>
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root") as HTMLElement;
createRoot(rootElement).render(
  <StrictMode>
    <SplashApp />
  </StrictMode>,
);
