import com.sun.star.comp.helper.Bootstrap;
import com.sun.star.uno.UnoRuntime;
import com.sun.star.uno.XComponentContext;
import com.sun.star.bridge.XUnoUrlResolver;
import com.sun.star.frame.*;
import com.sun.star.lang.XComponent;
public class ConvertStyles {
 public static void main(String[]args)throws Exception {
  XComponentContext local=Bootstrap.createInitialComponentContext(null);
  XUnoUrlResolver resolver=UnoRuntime.queryInterface(XUnoUrlResolver.class,local.getServiceManager().createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver",local));
  XComponentContext ctx=UnoRuntime.queryInterface(XComponentContext.class,resolver.resolve("uno:socket,host=127.0.0.1,port=20424;urp;StarOffice.ComponentContext"));
  Object desktop=ctx.getServiceManager().createInstanceWithContext("com.sun.star.frame.Desktop",ctx);XComponentLoader loader=UnoRuntime.queryInterface(XComponentLoader.class,desktop);
  System.out.println("POLICY named NEVER_EXECUTE / NO_UPDATE; separate close and reopen");
  for(int i=0;i<args.length;i+=2){XComponent doc=ReadStyles.open(loader,args[i]);if(doc==null)throw new Exception("Source load refused");
   UnoRuntime.queryInterface(XStorable.class,doc).storeToURL(new java.io.File(args[i+1]).toURI().toString(),new com.sun.star.beans.PropertyValue[]{ReadStyles.p("FilterName","Calc MS Excel 2007 XML"),ReadStyles.p("Overwrite",true)});doc.dispose();
   ReadStyles.inspect(loader,args[i]);ReadStyles.inspect(loader,args[i+1]);
  }
  UnoRuntime.queryInterface(XDesktop.class,desktop).terminate();
 }
}
