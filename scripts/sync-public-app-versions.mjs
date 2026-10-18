#!/usr/bin/env node
/**
 * Fail-closed public App Store release manifest sync.
 *
 * Only App Store Connect versions in READY_FOR_SALE can enter the manifest.
 * Neither draft releases nor TestFlight VALID builds are public versions.
 *
 * Environment (GitHub Actions): ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY
 * or ASC_PRIVATE_KEY_PATH.
 * Local LaunchAgent may instead use ~/.config/polyglot/asc-release-sync.json
 * with {keyId, issuerId, privateKeyPath}.
 *
 * --dry-run audits the source, prints only public version state.
 * Never automatically submits, publishes or updates an ASC version.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const APP_ID='6804499285';
export const READY_STATE='READY_FOR_SALE';
export const PLATFORMS=Object.freeze({IOS:'ios',MAC_OS:'macos'});
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifestFile=path.join(root,'public-app-versions.json');

export function compareVersions(a,b){
  const valid=v=>typeof v==='string' && /^\d+(?:\.\d+){0,4}$/.test(v);
  if(!valid(a)||!valid(b))throw Error('Invalid App Store version notation');
  const va=a.split('.').map(Number),vb=b.split('.').map(Number);
  for(let i=0;i<Math.max(va.length,vb.length);i++){
    const d=(va[i]??0)-(vb[i]??0);
    if(d!==0)return Math.sign(d);
  }
  return 0;
}

export function deriveReleasedVersions(records,current){
  if(!Array.isArray(records)||!records.length)throw Error('Empty App Store Connect version list');
  if(current?.appStoreId!==APP_ID)throw Error('App ID mismatch');
  const released={};
  for(const row of records){
    const a=row?.attributes ?? {};
    if(a.appStoreState!==READY_STATE)continue;
    const platform=PLATFORMS[a.platform];
    if(!platform)continue;
    if(!/^\d+(?:\.\d+){0,4}$/.test(a.versionString||''))continue;
    if(!released[platform]||compareVersions(a.versionString,released[platform])>0)
      released[platform]=a.versionString;
  }
  for(const platform of Object.values(PLATFORMS)){
    if(!released[platform])throw Error('No READY_FOR_SALE version for '+platform);
    const old=current[platform]?.version;
    if(!old)throw Error('Missing existing '+platform+' manifest version');
    if(compareVersions(released[platform],old)<0)
      throw Error('Apple public version unexpectedly older for '+platform+' (refusing downgrade)');
    const url=new URL(current[platform]?.url);
    if(url.protocol!=='https:'||url.hostname!=='apps.apple.com'||!url.pathname.includes('id'+APP_ID))
      throw Error('Unverified Apple store URL for '+platform);
  }
  return released;
}

function loadCredentials(){
  const configFile=path.join(os.homedir(),'.config/polyglot/asc-release-sync.json');
  const cfg=fs.existsSync(configFile)?JSON.parse(fs.readFileSync(configFile,'utf8')):{};
  const keyId=process.env.ASC_KEY_ID||cfg.keyId;
  const issuerId=process.env.ASC_ISSUER_ID||cfg.issuerId;
  const keyFile=process.env.ASC_PRIVATE_KEY_PATH||cfg.privateKeyPath;
  const privateKey=process.env.ASC_PRIVATE_KEY||
    (keyFile?fs.readFileSync(keyFile,'utf8'):null);
  if(!keyId||!issuerId||!privateKey)throw Error('ASC signing credentials unavailable');
  return {keyId,issuerId,privateKey};
}
function token(credentials){
  const now=Math.floor(Date.now()/1000);
  const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  const encoded=b64({alg:'ES256',kid:credentials.keyId,typ:'JWT'})+'.'+
    b64({iss:credentials.issuerId,iat:now-30,exp:now+900,aud:'appstoreconnect-v1'});
  const signature=crypto.sign('sha256',Buffer.from(encoded),{
    key:credentials.privateKey,dsaEncoding:'ieee-p1363'
  }).toString('base64url');
  return encoded+'.'+signature;
}

export async function fetchAppleVersions(authToken,request=fetch){
  let url='https://api.appstoreconnect.apple.com/v1/apps/'+APP_ID+'/appStoreVersions?limit=200';
  const records=[];
  const seen=new Set();
  for(let page=0;url&&page<20;page++){
    if(seen.has(url))throw Error('ASC pagination loop');
    const parsed=new URL(url);
    if(parsed.origin!=='https://api.appstoreconnect.apple.com')
      throw Error('Unexpected ASC pagination host');
    seen.add(url);
    const res=await request(url,{
      headers:{Authorization:'Bearer '+authToken,Accept:'application/json'},
      signal:AbortSignal.timeout(20000)
    });
    if(!res.ok)throw Error('ASC release-state request failed HTTP '+res.status);
    const body=await res.json();
    if(!Array.isArray(body.data))throw Error('Malformed ASC version response');
    records.push(...body.data);
    url=body.links?.next||null;
  }
  if(url)throw Error('ASC pagination limit exceeded');
  return records;
}

export async function synchronize({dryRun=false,records=null,now=new Date()}={}){
  const current=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  const source=records??await fetchAppleVersions(token(loadCredentials()));
  const latest=deriveReleasedVersions(source,current);
  const changed=Object.entries(latest).filter(([platform,version])=>version!==current[platform].version);
  if(changed.length){
    for(const [platform,version] of changed)current[platform].version=version;
    current.source='Apple App Store Connect READY_FOR_SALE (verified per platform)';
    current.lastPublicReleaseSync=now.toISOString();
    if(!dryRun){
      const temp=manifestFile+'.tmp-'+process.pid;
      try{
        fs.writeFileSync(temp,JSON.stringify(current,null,2)+'\n',{mode:0o644});
        fs.renameSync(temp,manifestFile);
      }catch(e){try{fs.unlinkSync(temp)}catch(_){}throw e;}
    }
  }
  return {releases:latest,changed:Object.fromEntries(changed),dryRun};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  synchronize({dryRun:process.argv.includes('--dry-run')})
    .then(result=>console.log(JSON.stringify(result)))
    .catch(e=>{console.error('[release-sync] '+e.message);process.exitCode=1;});
}
