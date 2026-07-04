import "./globals.css";

export const metadata = {
  title: "ShopSense — Semantic Product Search",
  description: "RAG-powered e-commerce recommendations over a 20k Flipkart catalog.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
