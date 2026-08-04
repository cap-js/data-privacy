using {
  cuid,
  managed,
  sap.common.CodeList
} from '@sap/cds/common';

namespace sap.capire.incidents;

/**
 * Customers using products sold by our company. Customers can create support
 * Incidents.
 */
entity Customers : cuid, managed {
  //ID          : Integer                          @title: 'Customer ID';
  firstName   : String @title: 'First Name';
  lastName    : String @title: 'Last Name';
  email       : EMailAddress @title: 'Email';
  phone       : PhoneNumber @title: 'Phone';
  incidents   : Association to many Incidents
                  on incidents.customer = $self
                @title: 'Incidents';
  legalEntity : Association to one LegalEntities @title: 'Legal entity';
}

/**
 * Incidents created by Customers.
 */
entity Incidents : cuid, managed {
  //ID            : Integer                          @title: 'Incident ID';
  customer             : Association to Customers @title: 'Customer';
  title                : String @title: 'Title';
  urgency              : Association to Urgency @title: 'Urgency';
  status               : Association to Status @title: 'Status';
  conversations        : Composition of many Conversations
                           on conversations.incidents = $self
                         @title: 'Conversations';
  legalEntity          : Association to one LegalEntities @title: 'Legal entity';
  incidentResolvedDate : Date;

}

entity Status : CodeList {
  key code        : String enum {
        new = 'N';
        assigned = 'A';
        in_process = 'I';
        on_hold = 'H';
        resolved = 'R';
        closed = 'C';
      };
      criticality : Integer @title: 'Criticality';
}

entity Urgency : CodeList {
  key code         : String enum {
        high = 'H';
        medium = 'M';
        low = 'L';
      };
      urgencyLevel : Integer @title: 'Urgency Level'; //New field
}

entity Conversations : cuid, managed {
  //ID        : Integer                  @title: 'Conversation ID';
  incidents : Association to Incidents @title: 'Incident';
  timestamp : DateTime  @cds.on.insert: $now  @title: 'Timestamp';
  author    : String  @cds.on.insert: $user  @title: 'Author';
  message   : String @title: 'Message';
}

type EMailAddress : String;
type PhoneNumber  : String;


@UI.HeaderInfo: {
  TypeName: 'LegalEntity',
  TypeNamePlural: 'LegalEntities',
  Title: {Value: title, },
  Description: {Value: description}
}
entity LegalEntities : managed {
  key title       : String;
      description : String;
}
