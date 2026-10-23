import com.sun.star.beans.*;
import com.sun.star.comp.helper.Bootstrap;
import com.sun.star.uno.UnoRuntime;
import com.sun.star.uno.XComponentContext;
import com.sun.star.bridge.XUnoUrlResolver;
import com.sun.star.frame.*;
import com.sun.star.container.*;
import com.sun.star.lang.XComponent;
import com.sun.star.text.*;
import com.sun.star.style.*;
import com.sun.star.document.*;
public class ProduceDoc {
 static PropertyValue p(String n,Object v){PropertyValue p=new PropertyValue();p.Name=n;p.Value=v;return p;}
 static String text(Object v){XText t=UnoRuntime.queryInterface(XText.class,v);return t==null?String.valueOf(v):t.getString().replace("\n","\\n");}
 static void notes(String kind,XIndexAccess list)throws Exception{for(int i=0;i<list.getCount();i++)System.out.println(kind+"\t"+(i+1)+"\t"+text(list.getByIndex(i)));}
 static XComponent open(XComponentLoader loader,String path)throws Exception{return loader.loadComponentFromURL(new java.io.File(path).toURI().toString(),"_blank",0,new PropertyValue[]{p("Hidden",true),p("ReadOnly",true),p("MacroExecutionMode",MacroExecMode.NEVER_EXECUTE),p("UpdateDocMode",UpdateDocMode.NO_UPDATE)});}
 public static void main(String[]args)throws Exception{
  XComponentContext local=Bootstrap.createInitialComponentContext(null);XUnoUrlResolver resolver=UnoRuntime.queryInterface(XUnoUrlResolver.class,local.getServiceManager().createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver",local));
  XComponentContext ctx=UnoRuntime.queryInterface(XComponentContext.class,resolver.resolve("uno:socket,host=127.0.0.1,port=20425;urp;StarOffice.ComponentContext"));
  Object desktop=ctx.getServiceManager().createInstanceWithContext("com.sun.star.frame.Desktop",ctx);XComponentLoader loader=UnoRuntime.queryInterface(XComponentLoader.class,desktop);
  System.out.println("POLICY NEVER_EXECUTE="+MacroExecMode.NEVER_EXECUTE+" NO_UPDATE="+UpdateDocMode.NO_UPDATE);
  for(String file:args){XComponent doc=open(loader,file);if(doc==null)throw new Exception("Load refused");String output=file.replaceFirst("\\.fodt$",".doc");UnoRuntime.queryInterface(XStorable.class,doc).storeToURL(new java.io.File(output).toURI().toString(),new PropertyValue[]{p("FilterName","MS Word 97"),p("Overwrite",true)});doc.dispose();doc=open(loader,output);System.out.println("DOCUMENT\t"+new java.io.File(output).getName());
   XTextDocument writer=UnoRuntime.queryInterface(XTextDocument.class,doc);System.out.println("BODY\t"+text(writer.getText()));
   notes("FOOTNOTE",UnoRuntime.queryInterface(XFootnotesSupplier.class,doc).getFootnotes());notes("ENDNOTE",UnoRuntime.queryInterface(XEndnotesSupplier.class,doc).getEndnotes());
   XNameAccess pages=UnoRuntime.queryInterface(XNameAccess.class,UnoRuntime.queryInterface(XStyleFamiliesSupplier.class,doc).getStyleFamilies().getByName("PageStyles"));
   for(String name:pages.getElementNames()){Object style=pages.getByName(name);XPropertySet props=UnoRuntime.queryInterface(XPropertySet.class,style);if(UnoRuntime.queryInterface(XStyle.class,style).isInUse()||name.equals("Unused")){System.out.println("PAGE\t"+name+"\tinUse="+UnoRuntime.queryInterface(XStyle.class,style).isInUse());for(String key:new String[]{"HeaderText","FooterText"})try{System.out.println(key+"\t"+text(props.getPropertyValue(key)));}catch(Exception ignored){}}}
   XEnumeration paragraphs=UnoRuntime.queryInterface(XEnumerationAccess.class,writer.getText()).createEnumeration();while(paragraphs.hasMoreElements()){Object p=paragraphs.nextElement();XPropertySet properties=UnoRuntime.queryInterface(XPropertySet.class,p);try{System.out.println("PARAGRAPH\t"+properties.getPropertyValue("ParaStyleName")+"\t"+properties.getPropertyValue("PageStyleName"));}catch(Exception ignored){}}
   XNameAccess tables=UnoRuntime.queryInterface(XTextTablesSupplier.class,doc).getTextTables();
   for(String name:tables.getElementNames()){XTextTable table=UnoRuntime.queryInterface(XTextTable.class,tables.getByName(name));for(String cell:table.getCellNames())System.out.println("CELL\t"+name+"\t"+cell+"\t"+text(table.getCellByName(cell)));}
   XNameAccess frames=UnoRuntime.queryInterface(XTextFramesSupplier.class,doc).getTextFrames();for(String name:frames.getElementNames())System.out.println("TEXTBOX\t"+name+"\t"+text(frames.getByName(name)));
   XEnumeration fields=UnoRuntime.queryInterface(XTextFieldsSupplier.class,doc).getTextFields().createEnumeration();while(fields.hasMoreElements()){XTextField field=UnoRuntime.queryInterface(XTextField.class,fields.nextElement());System.out.println("FIELD\t"+field.getPresentation(true)+"\t"+field.getPresentation(false));if(UnoRuntime.queryInterface(com.sun.star.lang.XServiceInfo.class,field).supportsService("com.sun.star.text.TextField.Annotation")){XPropertySet props=UnoRuntime.queryInterface(XPropertySet.class,field);System.out.println("ANNOTATION\t"+props.getPropertyValue("Author")+"\t"+props.getPropertyValue("Content"));}}
   doc.dispose();
  }
  UnoRuntime.queryInterface(XDesktop.class,desktop).terminate();
 }
}
