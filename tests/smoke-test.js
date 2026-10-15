const assert = require('node:assert/strict');
const Module=require('node:module');
const old=Module._load;
let handler;
Module._load=function(name,...args){
 if(name==='express') return {Router:()=>({use:()=>{},get:(path,fn)=>{handler=fn}})};
 return old.call(this,name,...args);
};
const create=require('../backend/routes/jobs.js');
Module._load=old;
process.env.JSEARCH_API_KEY='mock-only-key';
process.env.JSEARCH_MONTHLY_BUDGET='150';
const router=create();
let calls=[];
global.fetch=async function (url) {
 calls.push(new URL(url));
 const text=new URL(url).searchParams.get('query');
 return {ok:true, status:200, json:async()=>({status:'OK',data:{jobs:[{
  job_id: String(text).slice(0,16), job_title: String(text).includes('Splunk')?'Splunk Engineer':'DevOps Engineer',
  employer_name:'Example Inc', job_description:'Work on systems',job_location:'Baltimore, MD',
  job_apply_link:'https://example.com/jobs/'+encodeURIComponent(text),job_posted_at_datetime_utc:'2026-10-14T00:00:00.000Z',
  job_is_remote:true, job_min_salary:90000,job_max_salary:120000,job_salary_period:'YEAR',
  job_publisher:'Example Careers'
 }],cursor: text.includes('Splunk') ? 'next123' : ''}})};
};
async function request(query={}) {
 let out;
 const res={statusCode:200,status(n){this.statusCode=n;return this},set(){return this},json(payload){out={code:this.statusCode,payload};return this}};
 await handler({query,ip:'192.0.2.1',socket:{}},res);
 return out;
}
(async()=>{
 let defaultRes=await request();
 assert.equal(defaultRes.code,200);
 assert.equal(defaultRes.payload.jobs.length,5);
 assert.equal(calls.length,5);
 const again=await request();
 assert.equal(again.code,200);
 assert.equal(calls.length,5, '5 default queries reused cache');
 const splunk=await request({category:'Splunk Engineer'});
 assert.equal(splunk.code,200);
 assert.equal(calls.length,6);
 assert.equal(splunk.payload.jobs[0].salary.min,90000);
 assert.equal(splunk.payload.pagination.nextCursor,'next123');
 const remote=await request({category:'SOC Analyst',workplace:'remote',datePosted:'three_days',employmentType:'full_time',seniority:'entry'});
 assert.equal(remote.code,200);
 assert.equal(calls.length,7);
 const url=calls.at(-1);
 assert.equal(url.searchParams.get('work_from_home'),'true');
 assert.equal(url.searchParams.get('date_posted'),'3days');
 assert.equal(url.searchParams.get('employment_types'),'FULLTIME');
 assert.equal(url.searchParams.get('job_requirements'),'under_3_years_experience');
 assert.equal(url.searchParams.get('country'),'us');
 assert.equal((await request({category:'Untrusted Category'})).code,400);
 assert.equal((await request({page:'2'})).code,400);
 console.log('PASS: default mixed feed; caching; category; salary normalization; pagination; filters; validation');
})().catch(e=>{console.error(e);process.exitCode=1});
