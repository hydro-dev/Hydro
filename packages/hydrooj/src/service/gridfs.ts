import { GridFSBucket } from 'mongodb';
import { db2 } from './db';
import { HydroFileSystem } from '../interface';

const fs = new GridFSBucket(db2);

// @ts-ignore
global.Hydro.service.fs = fs;

export = fs as HydroFileSystem;
