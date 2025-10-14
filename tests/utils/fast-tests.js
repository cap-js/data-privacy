const cds = require('@sap/cds'), DataUtil = require('@sap/cds/lib/test/data'),
    LOG = cds.log('fast-tests');

//Fast tests is also required because else cds.test would try to delete nonexisting entities


//REVISIT - cds.test modifications for faster execution times - pr for cap is already opened
const { path, read, inspect  } = cds.utils;
const INSERT_from_csv = (entity, csv, schemaEvo) => {
    let [ cols, ...rows ] = cds.parse.csv (csv);
    if (rows.length > 0) return (schemaEvo ? UPSERT : INSERT).into (entity) .columns (cols) .rows (rows);
};
const INSERT_from_json = (entity, json, schemaEvo) => {
    let records = JSON.parse (json);
    if (records.length > 0) return (schemaEvo ? UPSERT : INSERT).into (entity) .entries (records);
};

const _from_csv_or_json = { '.json': INSERT_from_json, '.csv': INSERT_from_csv, };

const _entity4 = (file,csn) => {
    const name = file.replace(/-/g,'.');
    const entity = csn.definitions [name];
    if (!entity) {
        if (/(.+)[._]texts_?/.test(name)) { // 'Books.texts', 'Books.texts_de'
            const base = csn.definitions [RegExp.$1];
            return base?.elements?.texts && _entity4 (base.elements.texts.target, csn);
        }
        else return;
    }
    // We also support insert into simple views if they have no projection
    const p = entity.query && entity.query.SELECT || entity.projection;
    if (p && !p.columns && p.from.ref && p.from.ref.length === 1) {
        if (csn.definitions [p.from.ref[0]])  return entity;
    }
    return entity.name ? entity : { name, __proto__:entity };
};

cds.deploy.init = (db, csn=db.model, o, csvs, log=()=>{}) => db.run (async tx => {
    const inits=[];
    const schemaEvo = (db.options?.schema_evolution === 'auto' || o?.schema_evolution === 'auto');

    if (csvs) {
        const ccsn = cds.compile.for['nodejs'](csn); // compile to calculate keys for newly added entities
        for(let [file,src] of Object.entries(csvs)) {
            const entity = _entity4(path.basename(file, '.csv'), csn);
            if (entity?.name) {
                const q = INSERT_from_csv (entity.name,src,schemaEvo); if (!q) continue;
                if (db.kind === 'better-sqlite') _add_missing_pks2(q);
                q._target = ccsn.definitions[entity.name];
                inits.push (o.returnCSVQueries ? q : tx.run(q) .catch (e => {
                    throw Object.assign (e, { message: 'in cds.deploy(): ' + e.message +'\n'+ inspect(q) });
                }));
            }
        }
        if (o.returnCSVQueries) return inits;
    } else {
        const resources = await cds.deploy.resources(csn, {testdata: cds.env.features.test_data});
        for (let [file,e] of Object.entries(resources)) {
            if (e === '*') { // init.js/ts
                let x = await cds.utils._import(file);  if (!x) continue;
                if (x.default)  x = x.default;  // default ESM export
                inits.push (!x.then && typeof x === 'function' ? x(tx,csn) : x);
                log (file);
            } else { // from .csv or .json
                const INSERT_into = _from_csv_or_json [path.extname(file)];
                const src = await read(file,'utf8'); if (!src) continue;
                const q = INSERT_into (e,src,schemaEvo); if (!q) continue;
                if (db.kind === 'better-sqlite') _add_missing_pks2(q);
                if (cds.requires['cds.xt.ModelProviderService']?.kind === 'in-sidecar') q._target = csn.definitions[e];
                log (file,e);
                inits.push (tx.run(q) .catch (e => {
                    throw Object.assign (e, { message: 'in cds.deploy(): ' + e.message +'\n'+ inspect(q) });
                }));
            }
        }
    }
    
    await Promise.all(inits);

    /**
     *
     * @param q
     */
    function _add_missing_pks2 (q) {
        const {columns,rows} =  q.UPSERT || q.INSERT; // REVISIT: .entries are covered by current runtime. Should eventually also be handled here, as we likely don't do so in new db services
        if (columns) {
            const entity = csn.definitions[q._target.name], {uuid} = cds.utils;
            for (let k in entity.keys) if (!columns.includes(k) && !entity.keys[k].isAssociation) {
                columns.push(k);
                const t = entity.keys[k]._type, pk = t === 'cds.UUID' ? uuid : index => index+1;
                rows.forEach ((row,index) => row.push(pk(index)));
            }
        }
    }
});

DataUtil.prototype.reset = async function reset(db) {
    if (!db)  db = await cds.connect.to('db');
    //If data is reseted without having any information about the modified tables and auto reset is disabled reset everything
    //Without the condition for auto reset manual resetting would not work anymore
    if (Array.isArray(cds.modifiedTables)) {
        if (cds.modifiedTables.length === 0) return;
        //Import and and save as var csv file contents to only have one run of expensive reads
        if (!this._resources) {
            this._resources = [];
            this._inits = [];
            const resources = await cds.deploy.resources(db.model, {testdata: cds.env.features.test_data});
            for (let [file,e] of Object.entries(resources)) {
                if (e === '*') { // init.js/ts
                    let x = await cds.utils._import(file);  if (!x) continue;
                    if (x.default)  x = x.default;  // default ESM export
                    this._inits.push (!x.then && typeof x === 'function' ? x(db,db.model) : x);
                } else {
                    this._resources[e] = await cds.utils.read(file,'utf8');
                }
            }
        }
        const redeployTables = {};
        this._deletes = [];
        //Build list of delete queries for modified tables and also list of tables which have to be initialized again
        //Consider that (nested) composed tables have to be included in initialization
        for (const { name, compositions } of cds.modifiedTables) {
            if (redeployTables[name]) continue;
            let q = cds.ql.DELETE.from(name)
            q._autoReset = true
            this._deletes.push(q);
            
            //Add composition entities to delete / redeploy - manually adding entities to delete because draft tables lack on CASCADE
            const addCompositions = (compositions) => {
                for (const [, compTarget] of Object.entries(compositions)) {
                    //Also trigger delete on composition table as cascaded delete does not delete all records
                    let iq = cds.ql.DELETE.from(compTarget.target)
                    iq._autoReset = true
                    this._deletes.push(iq);
                    if (this._resources[compTarget.target]) {
                        redeployTables[compTarget.target] = this._resources[compTarget.target];
                    }
                    if (compTarget._target?.compositions) addCompositions(compTarget._target?.compositions);
                }
            };
            if (compositions) addCompositions(compositions);
            //Add to redeploy if there is a file
            if (!this._resources[name]) continue;
            redeployTables[name] = this._resources[name];
        }

        //Execute init.js / init.ts files if any
        if (this._inits) await Promise.all(this._inits);

        //Deleting modified table contents and inserting the initial data for the affected tables again
        //Everything in one transaction, to avoid any possible foreign key constraints
        let tx = db.tx();
        const redeployQueries = await cds.deploy.init(db, undefined, {returnCSVQueries: true}, redeployTables, undefined);
        try {
            await Promise.all(this._deletes.map(q => tx.run(q)));
            await Promise.all(redeployQueries.map(q => tx.run(q)));
            await tx.commit();
        } catch(e) {
            LOG.error(e)
            await tx.rollback(e);
        }
        cds.modifiedTables = [];
    } else {
        await this.delete(db);
        await cds.deploy.init(db);
    }
}

cds.once('listening', async ()=>{
    if (cds.modifiedTables === undefined) {
        cds.modifiedTables = [];
        if (!cds.db) await cds.connect.to('db');
        cds.db.prepend(db => {
            db.before(['INSERT', 'UPDATE', 'UPSERT', 'DELETE'], '*', async (req) => {
                const _getRoot = (entity) => !entity.query ? entity : _getRoot(entity.query._target);
                if (cds.modifiedTables) {
                    const root = _getRoot(req.target);
                    if (!cds.modifiedTables.some(e => e.name === root.name)) cds.modifiedTables.push(root);
                }
            });
        });
    }
})