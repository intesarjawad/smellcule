/** Small element helpers shared by the views. Content is always assigned as text, never markup. */

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className !== undefined) node.className = className;
  return node;
}

export function link(text: string, href: string): HTMLAnchorElement {
  const node = element("a", text);
  node.href = href;
  return node;
}

export function paragraph(text: string): HTMLParagraphElement {
  return element("p", text);
}
