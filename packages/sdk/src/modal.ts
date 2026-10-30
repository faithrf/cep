// Renders a modal inside a Shadow DOM. All text goes through textContent.

export interface ModalFlow {
  type: 'modal';
  headline: string;
  body?: string;
  cta?: string;
}

const CSS = `
.backdrop{position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;z-index:2147483647;font-family:system-ui,sans-serif}
.card{position:relative;background:#fff;color:#0f172a;border-radius:12px;padding:32px;max-width:420px;width:90%;box-shadow:0 20px 50px rgba(0,0,0,.3)}
h2{margin:0 0 12px;font-size:22px}
p{margin:0 0 20px;color:#475569;line-height:1.5}
button{font:inherit;cursor:pointer}
.cta{background:#4f46e5;color:#fff;border:0;border-radius:8px;padding:10px 18px}
.close{position:absolute;top:10px;right:12px;background:none;border:0;font-size:22px;color:#64748b}
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Shows the modal and returns true once it is attached to the page. */
export function showModal(flow: ModalFlow, onCta: () => void, onClose: () => void): boolean {
  if (!document.body) return false;
  const host = document.createElement('div');
  host.setAttribute('data-cep-host', '');
  const root = host.attachShadow({ mode: 'open' });

  const style = el('style');
  style.textContent = CSS;
  const backdrop = el('div', 'backdrop');
  const card = el('div', 'card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');

  const close = el('button', 'close', '×');
  close.setAttribute('aria-label', 'Close');
  card.append(close, el('h2', undefined, String(flow.headline ?? '')));
  if (flow.body) card.append(el('p', undefined, String(flow.body)));
  const cta = el('button', 'cta', String(flow.cta ?? 'Get started'));
  card.append(cta);
  backdrop.append(card);
  root.append(style, backdrop);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      dismiss();
      onClose();
    }
  };
  const dismiss = () => {
    document.removeEventListener('keydown', onKey);
    host.remove();
  };
  close.addEventListener('click', () => {
    dismiss();
    onClose();
  });
  cta.addEventListener('click', () => {
    dismiss();
    onCta();
  });
  document.addEventListener('keydown', onKey);

  document.body.append(host);
  return true;
}
