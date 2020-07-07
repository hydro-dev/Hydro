import { GridFSBucket } from 'mongodb';
import { db } from './db';

const exp = new GridFSBucket(db);

global.Hydro.service.gridfs = exp;

export default exp;
