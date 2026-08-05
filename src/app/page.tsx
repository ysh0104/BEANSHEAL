import fs from "fs";
import path from "path";

export default function CustomerHomepage() {
  const filePath = path.join(process.cwd(), "public", "legacy", "homepage.html");
  let htmlContent = "";
  try {
    htmlContent = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    console.error("Failed to read homepage.html:", err);
  }

  return (
    <div
      style={{ width: "100%", minHeight: "100vh" }}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}