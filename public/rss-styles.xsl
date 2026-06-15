<?xml version="1.0" encoding="UTF-8"?>
<!--
  Human-friendly rendering for /rss.xml. Browsers show raw RSS as a wall of
  tags; this XSL transforms the same feed into a readable, branded page when a
  person opens it, while feed readers ignore the stylesheet and parse the XML.
  Referenced from src/pages/rss.xml.js via the rss() `stylesheet` option.
-->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes" doctype-system="about:legacy-compat" />

  <xsl:template match="/">
    <html lang="en-GB">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title><xsl:value-of select="rss/channel/title" /> — RSS feed</title>
        <style>
          :root {
            --paper-50: #fbf8f1; --paper-100: #f7f3eb; --paper-200: #ede5d3;
            --ink-900: #1a1817; --ink-700: #3d3936; --ink-600: #5a544e; --ink-500: #7a7268; --ink-200: #ddd6c8;
            --accent: #7c2828; --accent-dark: #5a1c1c;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            background: var(--paper-50);
            color: var(--ink-700);
            font-family: "Source Serif 4", Georgia, "Times New Roman", serif;
            line-height: 1.6;
            -webkit-font-smoothing: antialiased;
          }
          .wrap { max-width: 44rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
          .kicker {
            font-family: "DM Sans", system-ui, sans-serif;
            text-transform: uppercase; letter-spacing: 0.2em; font-size: 0.7rem;
            color: var(--accent); margin: 0 0 0.6rem;
          }
          h1 {
            font-family: "DM Sans", system-ui, sans-serif;
            font-size: 2rem; line-height: 1.1; font-weight: 600; color: var(--ink-900); margin: 0 0 0.75rem;
          }
          .lede { font-size: 1.05rem; margin: 0 0 1.5rem; color: var(--ink-600); }
          .note {
            font-family: "DM Sans", system-ui, sans-serif; font-size: 0.85rem;
            background: var(--paper-200); border-left: 3px solid var(--accent);
            border-radius: 0 0.4rem 0.4rem 0; padding: 0.9rem 1.1rem; margin: 0 0 2.5rem; color: var(--ink-700);
          }
          .note strong { color: var(--ink-900); }
          .home {
            font-family: "DM Sans", system-ui, sans-serif; font-size: 0.8rem;
            text-transform: uppercase; letter-spacing: 0.12em; text-decoration: none;
            color: var(--accent);
          }
          .home:hover { color: var(--accent-dark); }
          ul { list-style: none; margin: 0; padding: 0; }
          li { padding: 1.5rem 0; border-top: 1px solid var(--ink-200); }
          li:first-child { border-top: none; }
          h2 { font-family: "DM Sans", system-ui, sans-serif; font-size: 1.2rem; line-height: 1.3; font-weight: 600; margin: 0 0 0.35rem; }
          h2 a { color: var(--ink-900); text-decoration: none; }
          h2 a:hover { color: var(--accent); }
          .date {
            font-family: "DM Sans", system-ui, sans-serif; font-size: 0.75rem;
            text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-500); margin: 0 0 0.5rem;
          }
          .desc { margin: 0; color: var(--ink-700); }
          footer { margin-top: 3rem; font-family: "DM Sans", system-ui, sans-serif; font-size: 0.8rem; color: var(--ink-500); }
          footer a { color: var(--accent); text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <p class="kicker">RSS feed</p>
          <h1><xsl:value-of select="rss/channel/title" /></h1>
          <p class="lede"><xsl:value-of select="rss/channel/description" /></p>

          <div class="note">
            <strong>This is a web feed.</strong> It’s meant for a feed reader, not for reading here.
            Copy this page’s address from your browser’s address bar and paste it into an app like
            Feedly, Inoreader or NetNewsWire to follow new articles automatically. Or just
            <a class="home" style="text-transform:none;letter-spacing:normal;font-size:inherit" href="{rss/channel/link}">read the website</a>.
          </div>

          <ul>
            <xsl:for-each select="rss/channel/item">
              <li>
                <h2><a href="{link}"><xsl:value-of select="title" /></a></h2>
                <p class="date"><xsl:value-of select="substring(pubDate, 1, 16)" /></p>
                <p class="desc"><xsl:value-of select="description" /></p>
              </li>
            </xsl:for-each>
          </ul>

          <footer>
            <p>
              <a href="{rss/channel/link}">← Back to <xsl:value-of select="rss/channel/title" /></a>
            </p>
          </footer>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
