const express = require('express');
const cors    = require('cors');
const path    = require('path');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin:'*', methods:['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders:['Content-Type','Authorization'] }));
app.use(express.json({ limit:'10mb' }));
app.use(express.urlencoded({ extended:true }));

// Static frontend
app.use(express.static(path.join(__dirname,'../frontend')));

// API routes
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/forms',     require('./routes/forms'));
app.use('/api/responses', require('./routes/responses'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/ai',        require('./routes/ai'));
app.use('/api/analytics', require('./routes/analytics'));

app.get('/api/health', (_req,res)=>res.json({status:'ok',time:new Date()}));

// HTML pages
const pages = [
  'login','register','dashboard',
  'questionnaire','form-builder','fill-form','review',
  'analytics','admin','profile','settings',
  'forgot-password','reset-password'
];
pages.forEach(p=>{
  app.get(`/${p}`,     (_req,res)=>res.sendFile(path.join(__dirname,`../frontend/pages/${p}.html`)));
  app.get(`/${p}.html`,(_req,res)=>res.sendFile(path.join(__dirname,`../frontend/pages/${p}.html`)));
});

app.get('/', (_req,res)=>res.sendFile(path.join(__dirname,'../frontend/pages/login.html')));

app.listen(PORT, ()=>{
  console.log(`\nQueryCraft running → http://localhost:${PORT}`);
  console.log(`API → http://localhost:${PORT}/api\n`);
});
