import {test} from 'node:test';
import assert from 'node:assert/strict';
import {APP_ID,compareVersions,deriveReleasedVersions,fetchAppleVersions} from './sync-public-app-versions.mjs';

const base={
 appStoreId:APP_ID,
 ios:{version:'1.1.8',url:'https://apps.apple.com/us/app/poly-glot-ai-workspace/id6804499285'},
 macos:{version:'3.6',url:'https://apps.apple.com/us/app/poly-glot-ai-workspace/id6804499285?mt=12'}
};
const item=(platform,version,appStoreState)=>({attributes:{platform,versionString:version,appStoreState}});
const current=[
 item('IOS','1.1.8','READY_FOR_SALE'),item('IOS','1.1.9','READY_FOR_REVIEW'),
 item('MAC_OS','3.6','READY_FOR_SALE'),item('MAC_OS','3.8','PREPARE_FOR_SUBMISSION')
];
test('versions compare numerically',()=>{
 assert.equal(compareVersions('1.1.10','1.1.9'),1);
 assert.equal(compareVersions('3.8','3.08'),0);
 assert.equal(compareVersions('3.8','3.9'),-1);
 assert.throws(()=>compareVersions('v1.2','1.2'));
});
test('draft and TestFlight-only builds cannot cause public notification',()=>{
 assert.deepEqual(deriveReleasedVersions([
  ...current,item('IOS','1.1.10','WAITING_FOR_REVIEW'),
  item('MAC_OS','3.9','PENDING_DEVELOPER_RELEASE')
 ],base),{ios:'1.1.8',macos:'3.6'});
});
test('a public iOS release must not change the Mac version',()=>{
 assert.deepEqual(deriveReleasedVersions([
  ...current,item('IOS','1.1.9','READY_FOR_SALE')
 ],base),{ios:'1.1.9',macos:'3.6'});
});
test('a public Mac release must not change iOS',()=>{
 assert.deepEqual(deriveReleasedVersions([
  ...current,item('MAC_OS','3.8','READY_FOR_SALE')
 ],base),{ios:'1.1.8',macos:'3.8'});
});
test('reject empty records, downgrade, missing platform or wrong app ID',()=>{
 assert.throws(()=>deriveReleasedVersions([],base));
 assert.throws(()=>deriveReleasedVersions([item('IOS','1.1.9','READY_FOR_SALE')],base));
 assert.throws(()=>deriveReleasedVersions([item('IOS','1.1.7','READY_FOR_SALE'),item('MAC_OS','3.6','READY_FOR_SALE')],base));
 assert.throws(()=>deriveReleasedVersions(current,{...base,appStoreId:'123'}));
});
test('reject non-Apple update destination',()=>{
 assert.throws(()=>deriveReleasedVersions(current,{...base,ios:{...base.ios,url:'https://evil.example/6804499285'}}));
});
test('fetch paginates, validates origin and fails closed on HTTP errors',async()=>{
 const request=async url=>{
  const u=new URL(url);
  return {
   ok:true,status:200,
   json:async()=>u.searchParams.has('cursor') ?
   {data:[item('MAC_OS','3.6','READY_FOR_SALE')]}:
   {data:[item('IOS','1.1.8','READY_FOR_SALE')],links:{next:'https://api.appstoreconnect.apple.com/v1/apps/'+APP_ID+'/appStoreVersions?cursor=2'}}
  };
 };
 const rows=await fetchAppleVersions('testtoken',request);
 assert.equal(rows.length,2);
 await assert.rejects(()=>fetchAppleVersions('x',async()=>({ok:false,status:401})),/401/);
 await assert.rejects(()=>fetchAppleVersions('x',async()=>({ok:true,json:async()=>({data:[],links:{next:'https://other.example/v1'}})})),/host/);
});
