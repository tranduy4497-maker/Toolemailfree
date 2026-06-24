import { authorize } from "./gmailAuth.js";

try {
  await authorize();
  console.log("OAuth OK. token.json đã được tạo.");
} catch (error) {
  console.error("OAuth failed:", error.message);
  process.exit(1);
}
