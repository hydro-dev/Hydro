import { GridFSBucket } from 'mongodb';
import db from './db';
import { HydroFileSystem } from '../interface';

const fs = new GridFSBucket(db.db2);

// @ts-ignore
global.Hydro.service.fs = fs;

export = fs as HydroFileSystem;
