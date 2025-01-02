using { managed, cuid, sap.common.CodeList } from '@sap/cds/common';

namespace sap.capire.blocking;


entity BlockingStore : cuid, managed {
  objectType          : String;         // like SalesOrder
  objectKey           : String;         // like 4711 or 0815      
  /*
   Single Key        >>> Plain, like 0001 or <UUID>
   Composite Key:    CLIENT = 000, KOKRS = 0001, KOSTL = 1000 -> JSON
  */
  objectAsBlob        : LargeString;    // LargeBinary;    // <JSON> of real object
  dataSubjectID       : String;         // DS of the Blob
  dataSubjectRole     : String;
  endOfRetentionDate  : DateTime;           // Timestamp ??  
                                        // might be dynamic - changing over time
                                        // due to legal changes   
  //  plus Resindence Reason ?
}

/*
Composition == Document

SalesOrder  (2025)
   -- Item 1   (2025)
   -- Item 2   (2023)

----> Retention of complete doc: 2025

Complete SalesOrder with all its compositions --->>> one BLOB

*/


