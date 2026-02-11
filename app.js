class LocalDataProvider {
  constructor(fields) {
    this.fields = fields;
    this.rows = [];
    this.onChange = null;
  }

  clearRows() {
    this.rows = [];
    this._emit();
  }

  setRows(rows) {
    this.rows = rows.map((row) => this._normalize(row));
    this._emit();
  }

  appendRow(row) {
    this.rows.push(this._normalize(row));
    this._emit();
  }

  removeRow(index) {
    if (index < 0 || index >= this.rows.length) {
      return;
    }
    this.rows.splice(index, 1);
    this._emit();
  }

  updateCell(index, field, value) {
    if (index < 0 || index >= this.rows.length || !this.fields.includes(field)) {
      return;
    }
    this.rows[index][field] = value;
    this._emit();
  }

  getJsonRows() {
    return [...this.rows];
  }

  _normalize(row) {
    const out = {};
    this.fields.forEach((field) => {
      out[field] = row[field] ?? '';
    });
    return out;
  }

  _emit() {
    if (typeof this.onChange === 'function') {
      this.onChange(this.rows);
    }
  }
}

class GridView {
  constructor(host, columns, dataProvider, options = {}) {
    this.host = host;
    this.columns = columns;
    this.dataProvider = dataProvider;
    this.clickable = options.clickable;
    this.selectable = options.selectable;
    this.editable = options.editable;
    this.onRowClicked = options.onRowClicked;
    this.onSelectionChanged = options.onSelectionChanged;
    this.selectedRowIndex = -1;

    this.dataProvider.onChange = () => {
      const rows = this.dataProvider.getJsonRows();
      if (this.selectedRowIndex >= rows.length) {
        this.selectedRowIndex = -1;
        this.onSelectionChanged?.(this.selectedRowIndex);
      }
      this.render();
    };
    this.render();
  }

  getSelectedRowIndex() {
    return this.selectedRowIndex;
  }

  clearSelection() {
    this.selectedRowIndex = -1;
    this.onSelectionChanged?.(this.selectedRowIndex);
    this.render();
  }

  selectRow(index) {
    this.selectedRowIndex = index;
    this.onSelectionChanged?.(this.selectedRowIndex);
    this.render();
  }

  render() {
    const rows = this.dataProvider.getJsonRows();
    const table = document.createElement('table');
    table.className = 'rg-table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    this.columns.forEach((column) => {
      const th = document.createElement('th');
      th.textContent = column.name;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    rows.forEach((row, rowIndex) => {
      const tr = document.createElement('tr');

      if (this.selectable && rowIndex === this.selectedRowIndex) {
        tr.classList.add('rg-row-selected');
      }

      if (this.clickable || this.selectable) {
        tr.classList.add('rg-row-clickable');
        tr.addEventListener('click', () => {
          if (this.selectable) {
            this.selectRow(rowIndex);
          }
          if (this.clickable) {
            this.onRowClicked?.(row, rowIndex);
          }
        });
      }

      this.columns.forEach((column) => {
        const td = document.createElement('td');
        const fieldValue = row[column.fieldName] ?? '';

        if (this.editable) {
          td.contentEditable = 'true';
          td.textContent = fieldValue;
          td.addEventListener('blur', () => {
            this.dataProvider.updateCell(rowIndex, column.fieldName, td.textContent?.trim() ?? '');
          });
        } else {
          td.textContent = fieldValue;
        }

        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    this.host.innerHTML = '';
    this.host.appendChild(table);
  }
}

function extractAttribute(source, attrName) {
  const pattern = new RegExp(`${attrName}\\s*=\\s*"([^"]*)"|${attrName}\\s*=\\s*'([^']*)'`, 'i');
  const matched = source.match(pattern);
  return matched?.[1] ?? matched?.[2] ?? '';
}

function parseBindName(valueAttr) {
  const cleaned = valueAttr.replace(/{{|}}/g, '').trim();
  const noPrefix = cleaned.replace(/^cntrData\./, '');
  const tokens = noPrefix.split('.').filter(Boolean);
  return tokens[tokens.length - 1] ?? '';
}

function parseTypeAndDataType(trHtml) {
  const lower = trHtml.toLowerCase();
  if (lower.includes('<sc-text-field')) {
    return { TYPE: 'Text', DATA_TYPE: 'String' };
  }
  if (lower.includes('<sc-number-field')) {
    return { TYPE: 'Number', DATA_TYPE: 'Number' };
  }
  return { TYPE: '', DATA_TYPE: '' };
}

export function parseTr(trHtml) {
  const labelMatch = trHtml.match(/<sc-label\b[^>]*>/i)?.[0] ?? '';
  const fieldName = extractAttribute(labelMatch, 'text');

  const textFieldMatch = trHtml.match(/<sc-text-field\b[^>]*>/i)?.[0] ?? trHtml.match(/<sc-[\w-]+\b[^>]*>/i)?.[0] ?? '';
  const valueAttr = extractAttribute(textFieldMatch, 'value');
  const bindName = parseBindName(valueAttr);

  const { TYPE, DATA_TYPE } = parseTypeAndDataType(trHtml);
  const required = /\brequired\b\s*=\s*"?true"?/i.test(trHtml) || /\brequired\b/i.test(textFieldMatch) ? 'Y' : 'N';

  return {
    PASTE_RAW: trHtml,
    FIELD_NAME: fieldName,
    BIND_NAME: bindName,
    TYPE,
    DATA_TYPE,
    REQUIRED: required,
    SORT_KEY: 'L',
  };
}

function extractTrBlocks(rawText) {
  const trRegex = /<tr\b[^>]*>[\s\S]*?(?:<\/tr>|$)/gi;
  const matches = rawText.match(trRegex);
  if (matches?.length) {
    return matches.map((item) => item.trim());
  }

  // fallback: tr closing tag missing entirely
  const fallbackRegex = /<tr\b[^>]*>[\s\S]*/i;
  const fallback = rawText.match(fallbackRegex)?.[0];
  return fallback ? [fallback.trim()] : [];
}

async function fetchTableList(keyword = '') {
  await new Promise((resolve) => setTimeout(resolve, 150));
  const sample = [
    { TABLE: 'TB_CNTR', TABLE_NAME: '계약 기본' },
    { TABLE: 'TB_BID', TABLE_NAME: '입찰 기본' },
    { TABLE: 'TB_VENDOR', TABLE_NAME: '협력사 기본' },
  ];

  const token = keyword.trim().toLowerCase();
  return token
    ? sample.filter((row) => row.TABLE.toLowerCase().includes(token) || row.TABLE_NAME.toLowerCase().includes(token))
    : sample;
}

const grid1Provider = new LocalDataProvider(['TABLE', 'TABLE_NAME']);
const grid2Provider = new LocalDataProvider(['TABLE', 'TABLE_NAME']);
const grid3Provider = new LocalDataProvider(['PASTE_RAW', 'FIELD_NAME', 'BIND_NAME', 'TYPE', 'DATA_TYPE', 'REQUIRED', 'SORT_KEY']);

new GridView(
  document.querySelector('#grid1'),
  [
    { name: 'TABLE', fieldName: 'TABLE' },
    { name: 'TABLE_NAME', fieldName: 'TABLE_NAME' },
  ],
  grid1Provider,
  {
    clickable: true,
    onRowClicked: (row) => {
      const exists = grid2Provider.getJsonRows().some((item) => item.TABLE === row.TABLE);
      if (!exists) {
        grid2Provider.appendRow(row);
      }
    },
  },
);

new GridView(
  document.querySelector('#grid2'),
  [
    { name: 'TABLE', fieldName: 'TABLE' },
    { name: 'TABLE_NAME', fieldName: 'TABLE_NAME' },
  ],
  grid2Provider,
);

const grid3View = new GridView(
  document.querySelector('#grid3'),
  [
    { name: 'PASTE_RAW', fieldName: 'PASTE_RAW' },
    { name: 'FIELD_NAME', fieldName: 'FIELD_NAME' },
    { name: 'BIND_NAME', fieldName: 'BIND_NAME' },
    { name: 'TYPE', fieldName: 'TYPE' },
    { name: 'DATA_TYPE', fieldName: 'DATA_TYPE' },
    { name: 'REQUIRED', fieldName: 'REQUIRED' },
    { name: 'SORT_KEY', fieldName: 'SORT_KEY' },
  ],
  grid3Provider,
  {
    selectable: true,
    editable: true,
  },
);

const searchBtn = document.querySelector('#searchBtn');
const keywordInput = document.querySelector('#keywordInput');
searchBtn.addEventListener('click', async () => {
  const list = await fetchTableList(keywordInput.value);
  grid1Provider.setRows(list);
});

const grid3Host = document.querySelector('#grid3');
const grid3AddBtn = document.querySelector('#grid3AddBtn');
const grid3DeleteBtn = document.querySelector('#grid3DeleteBtn');
const grid3ClearBtn = document.querySelector('#grid3ClearBtn');

function onPaste(rawText) {
  const trBlocks = extractTrBlocks(rawText);
  trBlocks.forEach((trHtml) => {
    const row = parseTr(trHtml);
    grid3Provider.appendRow(row);
  });
}

grid3Host.addEventListener('paste', (event) => {
  event.preventDefault();
  const rawText = event.clipboardData?.getData('text/plain') ?? '';
  onPaste(rawText);
});

grid3AddBtn.addEventListener('click', () => {
  grid3Provider.appendRow({
    PASTE_RAW: '',
    FIELD_NAME: '',
    BIND_NAME: '',
    TYPE: '',
    DATA_TYPE: '',
    REQUIRED: '',
    SORT_KEY: '',
  });
  const lastIndex = grid3Provider.getJsonRows().length - 1;
  grid3View.selectRow(lastIndex);
});

grid3DeleteBtn.addEventListener('click', () => {
  const selectedRowIndex = grid3View.getSelectedRowIndex();
  if (selectedRowIndex >= 0) {
    grid3Provider.removeRow(selectedRowIndex);
  }
});

grid3ClearBtn.addEventListener('click', () => {
  grid3Provider.clearRows();
  grid3View.clearSelection();
});

// demo seed for immediate interaction
grid1Provider.setRows([]);
