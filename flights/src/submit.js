// submit.js - handles sending form data to Google Apps Script endpoint.
// Replace GAS_ENDPOINT with your deployed Web App URL from Google Apps Script.

const GAS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxi-O85nimIfOKUrmcIcwLAHbeTQzbgntWegvgxjFrNJnyVJjBS6abGjjclLp6dQquvfA/exec';

export async function submitFormData(data) {
  if (!GAS_ENDPOINT || GAS_ENDPOINT.includes('YOUR_GOOGLE_APPS_SCRIPT_WEBAPP_URL')) {
    throw new Error('Google Apps Script endpoint not configured.');
  }

  // Use an offscreen form POST to bypass XHR/fetch CORS entirely.
  // Apps Script will receive e.parameter values.
  return submitViaHiddenForm(GAS_ENDPOINT, data);
}

function submitViaHiddenForm(actionUrl, data) {
  return new Promise((resolve, reject) => {
    try {
      const iframeName = 'gas_submit_iframe_' + Math.random().toString(36).slice(2);
      const iframe = document.createElement('iframe');
      iframe.name = iframeName;
      iframe.style.display = 'none';
      document.body.appendChild(iframe);

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = actionUrl;
      form.target = iframeName;
      form.style.display = 'none';

      Object.entries(data).forEach(([k, v]) => {
        if (Array.isArray(v)) {
          v.forEach((item) => addHidden(form, k, String(item)));
        } else if (v != null) {
          addHidden(form, k, String(v));
        }
      });

      document.body.appendChild(form);

      // Resolve after the iframe loads or after a short timeout, since cross-origin
      // prevents reading the result. This is a fire-and-forget submission.
      let settled = false;
      const cleanup = () => {
        if (form.parentNode) form.parentNode.removeChild(form);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      };
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve({ ok: true, method: 'hidden-form' });
        }
      }, 1500);

      iframe.addEventListener('load', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          cleanup();
          resolve({ ok: true, method: 'hidden-form' });
        }
      });

      form.submit();
    } catch (err) {
      reject(err);
    }
  });
}

function addHidden(form, name, value) {
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = name;
  input.value = value;
  form.appendChild(input);
}
