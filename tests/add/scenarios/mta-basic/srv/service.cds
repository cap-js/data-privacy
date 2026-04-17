using {test.add.basic as my} from '../db/schema';

service TestService {
  entity Foos as projection on my.Foo;
}
