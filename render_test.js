const ejs = require('ejs');
const path = require('path');
const fs = require('fs');

const template = path.join(__dirname, 'views', 'index.ejs');
const data = {
  isAdmin: true,
  rhythms: [{ id:1, name:'Morenada' }],
  selectedInstrument: 'todos',
  selectedRhythm: '',
  scores: [
    { id:1, title:"Partitura 'Especial' \"Con citas\"", rhythm_id:1, instrument:'trompeta', filename:'a.pdf', upload_date: new Date().toISOString() }
  ]
};

ejs.renderFile(template, data, {}, (err, str) => {
  if (err) {
    console.error('Render error:', err);
    process.exit(1);
  }
  console.log('Render successful, length:', str.length);
});
