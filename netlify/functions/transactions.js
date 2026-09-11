const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbzxhQPtdOAVmrcHNQIt21B7_--KIG2vI4httV0JpBYiPjXUNhsocj9wJZhHTJf7Vx_ZJA/exec';

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};

    const mode = params.mode || 'summary';

    const query = new URLSearchParams({
      mode: mode
    });

    if (mode === 'house') {
      const name = String(params.name || '')
        .trim()
        .toUpperCase();

      if (!/^TMV([1-9]|[1-7][0-9]|8[0-8])$/.test(name)) {
        return response(400, {
          ok: false,
          error: 'Invalid house name'
        });
      }

      query.set('name', name);
    }

    const target =
      APPS_SCRIPT_URL +
      '?' +
      query.toString();

    const res = await fetch(target, {
      redirect: 'follow'
    });

    const text = await res.text();

    if (!res.ok) {
      return response(502, {
        ok: false,
        error:
          'Apps Script HTTP ' +
          res.status,
        detail: text.slice(0, 500)
      });
    }

    let data;

    try {
      data = JSON.parse(text);
    } catch (err) {
      return response(502, {
        ok: false,
        error:
          'Apps Script returned invalid JSON',
        detail:
          text.slice(0, 500)
      });
    }

    return response(200, data);

  } catch (err) {

    return response(500, {
      ok: false,
      error:
        err && err.message
          ? err.message
          : String(err)
    });

  }
};


function response(statusCode, data) {
  return {
    statusCode,

    headers: {
      'Content-Type':
        'application/json; charset=utf-8',

      'Cache-Control':
        'no-store',

      'Access-Control-Allow-Origin':
        '*'
    },

    body:
      JSON.stringify(data)
  };
}
