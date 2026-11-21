// cartShare.js — sharing the cart. The Share button sends a LINK and nothing
// else (owner, 2026-11-21: "I want it to be a link … do not convert it to
// text"): the phone's share sheet (Web Share API: WhatsApp, SMS, mail …), or
// the link is copied where there is none. The link carries the cart itself
// (cartLink.js); whoever opens it sees the cart page as the sender sees it.

// → 'shared' | 'copied' | 'cancelled' | 'failed'
export async function shareLink({ title, url }) {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    // The link alone — no text beside it, so the message is just the link.
    const data = title ? { title, url } : { url };
    if (typeof navigator.canShare !== 'function' || navigator.canShare(data)) {
      try {
        await navigator.share(data);
        return 'shared';
      } catch (err) {
        // The user closed the share sheet: nothing to do. Any other refusal
        // (no share targets, blocked) falls through to the clipboard.
        if (err && err.name === 'AbortError') return 'cancelled';
      }
    }
  }
  return (await copyText(url)) ? 'copied' : 'failed';
}

async function copyText(text) {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* permission refused or no secure context — try the old route */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
