
const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbzxhQPtdOAVmrcHNQIt21B7_--KIG2vI4httV0JpBYiPjXUNhsocj9wJZhHTJf7Vx_ZJA/exec';


exports.handler = async (event) => {
  try {
    const method = event.httpMethod || 'GET';

    // OPTIONS: CORS
    if (method === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: corsHeaders(),
        body: ''
      };
    }

    // GET: Summary / House / Monthly
    if (method === 'GET') {
      return await handleGet(event);
    }

    // POST: Save expense data
    if (method === 'POST') {
      return await handlePost(event);
    }

    return response(405, {
      ok: false,
      error: 'Method not allowed'
    });

  } catch (err) {
    return response(500, {
      ok: false,
      error: err && err.message
        ? err.message
        : String(err)
    });
  }
};


/* ==================================================
   GET HANDLER
   รองรับ summary / house / monthly
================================================== */

async function handleGet(event) {
  const params = event.queryStringParameters || {};
  const mode = String(params.mode || 'summary').trim().toLowerCase();

  const query = new URLSearchParams();
  query.set('mode', mode);

  // HOUSE MODE
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

  // MONTHLY MODE
  // month: 1-12
  // year: ค.ศ. หรือ พ.ศ. ขึ้นอยู่กับ Apps Script ที่จะรองรับ
  if (mode === 'monthly') {
    const month = Number(params.month);
    const year = Number(params.year);

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return response(400, {
        ok: false,
        error: 'Invalid month. Use a number from 1 to 12.'
      });
    }

    if (!Number.isInteger(year) || year < 2000 || year > 2700) {
      return response(400, {
        ok: false,
        error: 'Invalid year.'
      });
    }

    query.set('month', String(month));
    query.set('year', String(year));
  }

  // VALID MODE
  if (!['summary', 'house', 'monthly'].includes(mode)) {
    return response(400, {
      ok: false,
      error: 'Invalid mode'
    });
  }

  const target = APPS_SCRIPT_URL + '?' + query.toString();

  const res = await fetch(target, {
    method: 'GET',
    redirect: 'follow'
  });

  const text = await res.text();

  if (!res.ok) {
    return response(502, {
      ok: false,
      error: 'Apps Script HTTP ' + res.status,
      detail: text.slice(0, 500)
    });
  }

  let data;

  try {
    data = JSON.parse(text);
  } catch (err) {
    return response(502, {
      ok: false,
      error: 'Apps Script returned invalid JSON',
      detail: text.slice(0, 500)
    });
  }

  // ไม่เปลี่ยนโครงสร้าง response จาก Apps Script
  return response(200, data);
}


/* ==================================================
   POST HANDLER
   บันทึกข้อมูลลง Google Sheets
================================================== */

async function handlePost(event) {
  if (!event.body) {
    return response(400, {
      ok: false,
      error: 'Missing request body'
    });
  }

  let body;

  try {
    body = JSON.parse(event.body);
  } catch (err) {
    return response(400, {
      ok: false,
      error: 'Invalid JSON body'
    });
  }

  // HOUSE VALIDATION
  const house = String(body.house || '')
    .trim()
    .toUpperCase();

  if (!/^TMV([1-9]|[1-7][0-9]|8[0-8])$/.test(house)) {
    return response(400, {
      ok: false,
      error: 'Invalid house'
    });
  }

  // MONTH VALIDATION
  const monthNo = Number(body.monthNo);

  if (!Number.isInteger(monthNo) || monthNo < 1 || monthNo > 12) {
    return response(400, {
      ok: false,
      error: 'Invalid monthNo'
    });
  }

  /*
   * ส่งเฉพาะ field ที่อนุญาต
   * ไม่ส่ง bill / outstanding / status
   * เพื่อป้องกันการเขียนทับสูตรในคอลัมน์ I / K / L
   */
  const safePayload = {
    house,
    monthNo,

    electric: safeNumberOrBlank(body.electric),
    water: safeNumberOrBlank(body.water),
    pool: safeNumberOrBlank(body.pool),
    cleaning: safeNumberOrBlank(body.cleaning),
    inOut: safeNumberOrBlank(body.inOut),
    laundry: safeNumberOrBlank(body.laundry),
    other: safeNumberOrBlank(body.other),
    paid: safeNumberOrBlank(body.paid),

    note: safeText(body.note, 1000),
    verification: safeVerification(body.verification),
    billDate: safeDate(body.billDate)
  };

  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(safePayload)
  });

  const text = await res.text();

  if (!res.ok) {
    return response(502, {
      ok: false,
      error: 'Apps Script HTTP ' + res.status,
      detail: text.slice(0, 500)
    });
  }

  let data;

  try {
    data = JSON.parse(text);
  } catch (err) {
    return response(502, {
      ok: false,
      error: 'Apps Script returned invalid JSON',
      detail: text.slice(0, 500)
    });
  }

  if (!data || data.ok !== true) {
    return response(400, data || {
      ok: false,
      error: 'Save failed'
    });
  }

  return response(200, data);
}


/* ==================================================
   HELPERS
================================================== */

function safeNumberOrBlank(value) {
  if (value === '' || value === null || value === undefined) {
    return '';
  }

  const num = Number(value);
  return Number.isFinite(num) ? num : '';
}


function safeText(value, maxLength) {
  return String(value || '')
    .trim()
    .slice(0, maxLength);
}


function safeVerification(value) {
  const text = String(value || '').trim();

  const allowed = [
    '',
    'รอตรวจสอบ',
    'ตรวจสอบแล้ว'
  ];

  return allowed.includes(text) ? text : '';
}


function safeDate(value) {
  if (!value) {
    return '';
  }

  const text = String(value).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return '';
  }

  return text;
}


function response(statusCode, data) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(data)
  };
}


function corsHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
}
