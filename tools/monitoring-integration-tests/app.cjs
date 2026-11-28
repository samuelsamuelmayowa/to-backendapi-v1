'use strict';
const express = require('../../node_modules/express');
const mode = process.env.MONITORING_TEST_MODE;
const app = express();
let client, collection, model, mysql, endpoint;
async function prepare() {
  if (mode === 'mongodb' || mode === 'mongoose') {
    if (!/^mongodb:\/\/127\.0\.0\.1:\d+\/monitoring_test$/.test(process.env.MONITORING_TEST_MONGO_URI || '')) throw new Error('Only the disposable loopback database is allowed');
    if (mode === 'mongodb') {
      const { MongoClient } = require('mongodb'); client = new MongoClient(process.env.MONITORING_TEST_MONGO_URI);
      await client.connect(); collection=client.db().collection('private_DO_NOT_EXPORT_PRIVATE');
      await collection.insertOne({ value:'DO_NOT_EXPORT_PRIVATE' });
    } else {
      const mongoose=require('mongoose'); client=mongoose;
      await mongoose.connect(process.env.MONITORING_TEST_MONGO_URI,{autoIndex:false,autoCreate:false});
      model=mongoose.model('Probe',new mongoose.Schema({value:String},{collection:'private_DO_NOT_EXPORT_PRIVATE',autoCreate:false,autoIndex:false}));
      await model.create({value:'DO_NOT_EXPORT_PRIVATE'});
    }
  }
  if (mode === 'mysql2') {
    mysql=require('mysql2'); endpoint=mysql.createServer();
    endpoint.on('connection', connection=>{
      connection.on('error',()=>{});
      connection.serverHandshake({protocolVersion:10,serverVersion:'8.0.0-test',connectionId:1,statusFlags:2,characterSet:45,capabilityFlags:0x8a205});
      connection.on('query',statement=>{
        if (statement.includes('FAIL')) return connection.writeError({code:1105,message:'DO_NOT_EXPORT_PRIVATE'});
        connection.writeColumns([{catalog:'def',schema:'',table:'',orgTable:'',name:'value',orgName:'',characterSet:45,columnLength:1,columnType:3,flags:0,decimals:0}]);
        connection.writeTextRow([1]); connection.writeEof();
      });
    });
    await new Promise(resolve=>endpoint.listen(0,'127.0.0.1',resolve));
  }
}
app.get('/health',(req,res)=>res.json({ok:true}));
app.get('/database',async(req,res)=>{
  try {
    if(mode==='mongodb') await collection.findOne({value:'DO_NOT_EXPORT_PRIVATE'});
    if(mode==='mongoose') await model.findOne({value:'DO_NOT_EXPORT_PRIVATE'}).lean().exec();
    if(mode==='mysql2') {
      const connection=mysql.createConnection({host:'127.0.0.1',port:endpoint._server.address().port,user:'probe',password:'DO_NOT_EXPORT_PRIVATE'});
      try { await connection.promise().query('SELECT 1 /* DO_NOT_EXPORT_PRIVATE */'); } finally { connection.destroy(); }
    }
    res.json({ok:true});
  } catch { res.status(500).json({ok:false}); }
});
app.get('/failure',async(req,res)=>{
  try {
    if(mode==='mongodb') await client.db().command({notARealCommand:'DO_NOT_EXPORT_PRIVATE'});
    if(mode==='mongoose') await client.connection.db.command({notARealCommand:'DO_NOT_EXPORT_PRIVATE'});
    res.json({ok:true});
  } catch { res.status(500).json({ok:false}); }
});
prepare().then(()=>{
  const server=app.listen(0,'127.0.0.1',()=>console.log(`READY ${server.address().port}`));
  process.on('SIGTERM',async()=>{server.close();if(client){if(mode==='mongoose')await client.disconnect();else await client.close();}if(endpoint)endpoint.close();});
}).catch(()=>{console.error('Controlled app setup failed');process.exitCode=1;});
