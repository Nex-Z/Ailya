import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { eq } from 'drizzle-orm'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { getLoadablePath } from 'sqlite-vec'
const sessions = sqliteTable('sessions', { id: text().primaryKey(), data: text().notNull(), created_at: integer().notNull() })
export class Storage {
  db: Database
  orm: ReturnType<typeof drizzle>
  constructor(path: string, extension = process.env.AILYA_VEC_EXTENSION || getLoadablePath()) {
    mkdirSync(dirname(resolve(path)), { recursive: true })
    this.db = new Database(path, { create: true, strict: true })
    try {
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;')
    this.db.loadExtension(extension)
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY)')
    const version = this.db.query('SELECT max(version) AS version FROM schema_migrations').get() as {version:number|null}
    const current=version.version??0
    if(current>10)throw Error('数据库版本高于当前 Core')
    for(let next=current+1;next<=10;next++){
      this.backup(`${path}.before-v${next}-${Date.now()}-${crypto.randomUUID()}`)
      const migration=readFileSync(new URL(`./migrations/${String(next).padStart(4,'0')}.sql`,import.meta.url),'utf8')
      this.db.transaction(()=>{this.db.exec(migration);this.db.run('INSERT INTO schema_migrations VALUES(?)',[next])})()
    }
    this.orm = drizzle(this.db)
    } catch(error) {this.db.close(true);throw error}
  }
  backup(path: string) { this.db.run('VACUUM INTO ?', [resolve(path)]) }
  all<T>(sql: string, ...args: (string|number|null)[]) { return this.db.query(sql).all(...args) as T[] }
  get<T>(sql: string, ...args: (string|number|null)[]) { return this.db.query(sql).get(...args) as T|undefined }
  saveSession<T extends { id: string }>(session: T) {
    this.orm.insert(sessions).values({id:session.id,data:JSON.stringify(session),created_at:Date.now()}).onConflictDoUpdate({target:sessions.id,set:{data:JSON.stringify(session)}}).run()
  }
  session<T>(id:string): T|undefined { const row=this.orm.select().from(sessions).where(eq(sessions.id,id)).get(); return row ? JSON.parse(row.data) : undefined }
  list<T>(): T[] { return this.all<{data:string}>('SELECT data FROM sessions ORDER BY created_at DESC').map(r=>JSON.parse(r.data)) }
  event(sessionId:string, taskId:string|null, kind:string, data:unknown) {
    const result=this.db.run('INSERT INTO events(session_id,task_id,kind,data,created_at) VALUES(?,?,?,?,?)',[sessionId,taskId,kind,JSON.stringify(data),Date.now()]); return Number(result.lastInsertRowid)
  }
  vector(input: {id:string;scope:string;model:string;revision:string;content:string;embedding:number[]}) {
    if (!input.embedding.length || input.embedding.some(x=>!Number.isFinite(x))) throw Error('无效向量')
    const v=new Float32Array(input.embedding)
    this.db.run('INSERT OR REPLACE INTO vector_sources VALUES(?,?,?,?,?,?,?,?)',[input.id,input.scope,input.model,input.revision,v.length,input.content,createHash('sha256').update(input.content).digest('hex'),new Uint8Array(v.buffer)])
  }
  search(scope:string,model:string,revision:string,embedding:number[],limit=5) {
    if (!embedding.length || embedding.some(x=>!Number.isFinite(x)) || !Number.isInteger(limit) || limit<1 || limit>100) throw Error('无效向量查询')
    const wrong=this.get<{n:number}>('SELECT count(*) n FROM vector_sources WHERE scope=? AND model=? AND revision=? AND dimensions<>?',scope,model,revision,embedding.length)
    if(wrong?.n) throw Error('向量维度不一致')
    return this.db.query('SELECT id,content,vec_distance_L2(embedding,?) distance FROM vector_sources WHERE scope=? AND model=? AND revision=? AND dimensions=? ORDER BY distance,id LIMIT ?').all(new Uint8Array(new Float32Array(embedding).buffer),scope,model,revision,embedding.length,limit)
  }
  close(){this.db.close(true)}
}





