import { GridFSBucket } from 'mongodb';
import { db2 } from './db';

const fs = new GridFSBucket(db2);

global.Hydro.service.gridfs = fs;

export = fs;
