// Converts the small HTML subset the frontend's RichTextEditor toolbar
// produces (bold/italic/underline, <div>/<p>/<br> line breaks, <ul><li>
// bullets — see App.jsx) into ExcelJS "rich text" runs. Excel cells can't
// render real HTML, but { richText: [...] } — an array of { font, text }
// segments — is the closest equivalent: each run carries its own
// bold/italic/underline, letting the same formatting the user applied in
// the editor show up here instead of printing literal <b> tags or losing
// the formatting entirely. Only ever fed HTML from that one trusted source
// (see item.descriptionIsHtml in server.js's splitDescription and
// buildPackingListDraft in App.jsx), so no sanitization beyond decoding the
// handful of entities execCommand's output can include.
//
// Shared by salesInvoiceXlsx.js (Proforma/Commercial Invoice) and
// packingListXlsx.js (Packing List) — both feed the same item shape into
// their own item-description cell.
function htmlToExcelRuns(html, baseFont) {
  const runs = [];
  let bold = false, italic = false, underline = false, atLineStart = true;
  const pushText = (text) => {
    if (!text) return;
    runs.push({ font: { ...baseFont, bold, italic, underline }, text });
    atLineStart = false;
  };
  const pushBreak = () => {
    if (!atLineStart) { runs.push({ font: { ...baseFont }, text: "\n" }); atLineStart = true; }
  };
  const tokens = String(html).split(/(<[^>]+>)/g);
  for (const token of tokens) {
    if (!token) continue;
    const tagMatch = token.match(/^<\/?([a-z0-9]+)/i);
    if (tagMatch) {
      const tag = tagMatch[1].toLowerCase();
      const closing = token.startsWith("</");
      if (tag === "b" || tag === "strong") bold = !closing;
      else if (tag === "i" || tag === "em") italic = !closing;
      else if (tag === "u") underline = !closing;
      else if (tag === "li" && !closing) { pushBreak(); pushText("• "); }
      else if ((tag === "div" || tag === "p") && !closing) pushBreak();
      else if (tag === "br") pushBreak();
      continue;
    }
    const text = token
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    pushText(text);
  }
  return runs.length ? runs : [{ font: baseFont, text: "" }];
}

module.exports = { htmlToExcelRuns };
