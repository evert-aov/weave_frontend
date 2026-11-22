import {describe,it,expect} from 'vitest';
import {hitTestPage} from './canvas-hit-test';
import {PageDisplayList} from './canvas-page-renderer';
describe('logical Canvas hit testing',()=>{
  const page:PageDisplayList={id:'p',revision:1,width:600,height:800,commands:[
    {kind:'text',text:'😀',x:10,y:20,font:'16px serif',color:'black',source:{start:{nodeId:'a',offset:0},end:{nodeId:'a',offset:2},top:4,width:16,height:16}},
    {kind:'text',text:'b',x:10,y:50,font:'16px serif',color:'black',source:{start:{nodeId:'b',offset:0},end:{nodeId:'b',offset:1},top:34,width:8,height:16}},
  ]};
  it('chooses a whole-grapheme boundary and the nearest line',()=>{
    expect(hitTestPage(page,11,10)).toEqual({nodeId:'a',offset:0});
    expect(hitTestPage(page,24,10)).toEqual({nodeId:'a',offset:2});
    expect(hitTestPage(page,500,45)).toEqual({nodeId:'b',offset:1});
    expect(hitTestPage(page,NaN,2)).toBeNull();
  });
});
