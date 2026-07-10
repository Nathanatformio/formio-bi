export const metadata = {
  title: "Form.io — Weekly Marketing Report",
  description: "BI reporting engine powered by Supermetrics on Vercel",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", background: "#f6f7fb", color: "#1a1a2e" }}>
        {children}
      </body>
    </html>
  );
}
