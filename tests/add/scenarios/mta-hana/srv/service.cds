using {test.add.hana as my} from '../db/schema';

service TestService {
  entity Bars as projection on my.Bar;
}
