import { GridFSBucket } from 'mongodb';
import { db } from './db';

export const fs = new GridFSBucket(db);

global.Hydro.service.gridfs = fs;

export default fs;
