const XLSX = require('/Users/muhammadusman/Sites/email-system/node_modules/xlsx');
const wb = XLSX.readFile('/Users/muhammadusman/Sites/email-system/tu-berlin-batch-2.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
console.log('Header:', data[0]);
console.log('Total data rows:', data.length - 1);
console.log('First 5:', data.slice(1, 6));
console.log('Last 3:', data.slice(-3));
